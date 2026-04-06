/**
 * User roles for Role-Based Access Control (RBAC)
 *
 * - ADMIN: Full access to all tenants, all CRUD operations, can manage user roles
 * - MANAGER: Full CRUD access within own tenant only
 * - VIEWER: Read-only access within own tenant, restricted fields
 */
export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  VIEWER = 'VIEWER',
}

/**
 * Permission definitions for each role
 */
export const ROLE_PERMISSIONS = {
  [Role.ADMIN]: {
    canAccessAllTenants: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    canManageRoles: true,
    canViewRestrictedFields: true,
  },
  [Role.MANAGER]: {
    canAccessAllTenants: false,
    canCreate: true,
    canUpdate: true,
    canDelete: false, // Only admin can delete
    canManageRoles: false,
    canViewRestrictedFields: true,
  },
  [Role.VIEWER]: {
    canAccessAllTenants: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canManageRoles: false,
    canViewRestrictedFields: false, // Restricted fields hidden
  },
} as const;

/**
 * Type for role permissions
 */
export type RolePermissions = typeof ROLE_PERMISSIONS[Role];
