import { Injectable } from '@nestjs/common';
import { Role, ROLE_PERMISSIONS } from './enums/roles.enum';
import { UserContext } from '../auth/types/user-context.interface';
import { PrismaService } from '../common/prisma.service';

/**
 * RBAC Service - Handles role-based access control logic
 *
 * This is a CRITICAL security boundary. All permission checks and
 * tenant filtering must go through this service to prevent data leaks.
 */
@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  /**
   * Check if a user can access a specific tenant
   *
   * @param user - Current user context
   * @param tenantId - Tenant ID to check access for (null for ADMIN users)
   * @returns true if user can access the tenant, false otherwise
   */
  canAccessTenant(user: UserContext, tenantId: string | null): boolean {
    // Admin can access all tenants (including null tenantId for other ADMIN users)
    if (user.role === Role.ADMIN) {
      return true;
    }

    // Null tenantId means the record belongs to an ADMIN user
    // Non-admin users cannot access ADMIN user records
    if (tenantId === null) {
      return false;
    }

    // Other roles can only access their own tenant
    return user.tenantId === tenantId;
  }

  /**
   * Check if a user can access a specific record
   *
   * @param user - Current user context
   * @param record - Record with tenantId property (null for ADMIN users)
   * @returns true if user can access the record, false otherwise
   */
  canAccessRecord(
    user: UserContext,
    record: { tenantId: string | null } | null | undefined,
  ): boolean {
    if (!record) {
      return false;
    }

    return this.canAccessTenant(user, record.tenantId);
  }

  /**
   * Filter sensitive fields from a record based on user role
   *
   * VIEWER role cannot see certain sensitive fields.
   * This prevents unauthorized data exposure.
   *
   * @param user - Current user context
   * @param record - Record to filter
   * @returns Filtered record with sensitive fields removed if necessary
   */
  filterFieldsByRole<T extends Record<string, any>>(
    user: UserContext,
    record: T,
  ): Partial<T> {
    // VIEWER role has restricted field access
    if (user.role === Role.VIEWER) {
      // Create a copy without sensitive fields
      const { assignedUser, ...safeRecord } = record as any;

      // For PCR records, also hide certain internal fields
      if ('createdBy' in safeRecord) {
        const { creator, ...finalRecord } = safeRecord;
        return finalRecord as Partial<T>;
      }

      return safeRecord as Partial<T>;
    }

    // ADMIN and MANAGER can see all fields
    return record;
  }

  /**
   * Get list of tenant IDs the user can access
   *
   * @param user - Current user context
   * @returns Array of tenant IDs the user can access
   */
  async getVisibleTenants(user: UserContext): Promise<string[]> {
    // Admin can see all tenants
    if (user.role === Role.ADMIN) {
      const tenants = await this.prisma.tenant.findMany({
        select: { id: true },
      });
      return tenants.map((t) => t.id);
    }

    // Other roles can only see their own tenant
    // Non-admin users must have a tenantId
    if (!user.tenantId) {
      return [];
    }
    return [user.tenantId];
  }

  /**
   * Check if user has permission for a specific action
   *
   * @param user - Current user context
   * @param action - Action to check (create, update, delete, etc.)
   * @returns true if user has permission, false otherwise
   */
  hasPermission(
    user: UserContext,
    action: keyof (typeof ROLE_PERMISSIONS)[Role],
  ): boolean {
    const permissions = ROLE_PERMISSIONS[user.role as Role];
    return permissions?.[action] ?? false;
  }

  /**
   * Check if user can create resources
   */
  canCreate(user: UserContext): boolean {
    return this.hasPermission(user, 'canCreate');
  }

  /**
   * Check if user can update resources
   */
  canUpdate(user: UserContext): boolean {
    return this.hasPermission(user, 'canUpdate');
  }

  /**
   * Check if user can delete resources
   */
  canDelete(user: UserContext): boolean {
    return this.hasPermission(user, 'canDelete');
  }

  /**
   * Check if user can manage other users' roles
   */
  canManageRoles(user: UserContext): boolean {
    return this.hasPermission(user, 'canManageRoles');
  }

  /**
   * Check if user can view restricted fields
   */
  canViewRestrictedFields(user: UserContext): boolean {
    return this.hasPermission(user, 'canViewRestrictedFields');
  }

  /**
   * Validate that a user can perform an operation on a record
   *
   * @param user - Current user context
   * @param record - Record to check
   * @param operation - Operation to perform (create, update, delete)
   * @throws ForbiddenException if user cannot perform the operation
   */
  validateAccess(
    user: UserContext,
    record: { tenantId: string } | null,
    operation: 'create' | 'update' | 'delete',
  ): void {
    // Check if user can access the tenant
    if (!this.canAccessRecord(user, record)) {
      throw new Error('Access denied: Cannot access this tenant');
    }

    // Check if user has permission for the operation
    switch (operation) {
      case 'create':
        if (!this.canCreate(user)) {
          throw new Error('Access denied: Cannot create resources');
        }
        break;
      case 'update':
        if (!this.canUpdate(user)) {
          throw new Error('Access denied: Cannot update resources');
        }
        break;
      case 'delete':
        if (!this.canDelete(user)) {
          throw new Error('Access denied: Cannot delete resources');
        }
        break;
    }
  }
}
