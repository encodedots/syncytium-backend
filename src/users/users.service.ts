import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { UserContext } from '../auth/types/user-context.interface';
import {
  PaginatedResponse,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../rbac/enums/roles.enum';
import { Auth0ManagementService } from '../auth/services/auth0-management.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private rbacService: RbacService,
    private auth0Management: Auth0ManagementService,
  ) {}

  /**
   * Get all users filtered by RBAC with pagination
   * ADMIN sees all tenants, others see only their own tenant
   */
  async findAll(
    user: UserContext,
    filters: UserFilterDto,
  ): Promise<PaginatedResponse<any>> {
    // Get visible tenants based on role
    const visibleTenants = await this.rbacService.getVisibleTenants(user);

    // Build where clause with filters
    // Include users from visible tenants + ADMIN users (tenantId = null)
    const where: any = {
      AND: [
        {
          OR: [
            { tenantId: { in: visibleTenants } },
            { tenantId: null }, // Include ADMIN users without tenant
          ],
        },
      ],
    };

    // MANAGERS cannot see ADMIN users
    if (user.role === Role.MANAGER) {
      where.AND.push({ role: { not: Role.ADMIN } });
    }

    // Apply search filter (searches in name and email)
    if (filters.search) {
      where.AND.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    // Apply role filter (override the MANAGER filter if specific role requested)
    if (filters.role) {
      // If manager requests ADMIN role, still block it
      if (user.role === Role.MANAGER && filters.role === Role.ADMIN) {
        where.AND.push({ role: { not: Role.ADMIN } });
      } else {
        where.AND.push({ role: filters.role });
      }
    }

    // Apply status filter
    if (filters.status) {
      where.AND.push({ isActive: filters.status === 'active' });
    }

    // Get total count for pagination
    const total = await this.prisma.user.count({ where });

    // Query users from visible tenants with pagination
    const users = await this.prisma.user.findMany({
      where,
      skip: filters.skip,
      take: filters.take,
      include: {
        tenant: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Apply field filtering based on role
    const filteredUsers = users.map((u) =>
      this.rbacService.filterFieldsByRole(user, u),
    );

    // Return paginated response
    return createPaginatedResponse(
      filteredUsers,
      total,
      filters.page!,
      filters.limit!,
    );
  }

  /**
   * Create a new user
   * Only ADMIN and MANAGER can create users
   * MANAGER can only create users in their own tenant
   *
   * IMPORTANT: Also creates user in Auth0 with default password
   */
  async create(dto: CreateUserDto, currentUser: UserContext) {
    // Determine tenant ID
    let tenantId: string | null | undefined = dto.tenantId;

    // If not admin, force tenant to be current user's tenant
    if (currentUser.role !== Role.ADMIN) {
      tenantId = currentUser.tenantId;
    }

    // ADMIN users don't require a tenantId (they can access all tenants)
    // Other roles (MANAGER, VIEWER) require a tenantId
    if (!tenantId && dto.role !== Role.ADMIN) {
      throw new BadRequestException('tenantId is required for non-ADMIN users');
    }

    // Check if user can access this tenant (skip for ADMIN users without tenant)
    if (tenantId && !this.rbacService.canAccessTenant(currentUser, tenantId)) {
      throw new ForbiddenException('Cannot create user in this tenant');
    }

    // Check if email already exists in database
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    let auth0Id = dto.auth0Id;

    // Create user in Auth0 if no auth0Id provided
    if (!auth0Id) {
      try {
        this.logger.log(`Creating user in Auth0: ${dto.email}`);
        auth0Id = await this.auth0Management.createUser(dto.email, dto.name);
        this.logger.log(`✅ User created in Auth0 with ID: ${auth0Id}`);
      } catch (error: any) {
        this.logger.error(`Failed to create user in Auth0: ${error.message}`);
        throw new BadRequestException(
          `Failed to create user in Auth0: ${error.message}`,
        );
      }
    }

    // Create user in database
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        tenantId,
        auth0Id,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
      include: {
        tenant: true,
      },
    });

    this.logger.log(`✅ User created in database: ${user.email}`);

    // Apply field filtering
    return this.rbacService.filterFieldsByRole(currentUser, user);
  }

  /**
   * Update an existing user
   * ADMIN can update any user including role changes
   * MANAGER can update users in their tenant (except roles)
   */
  async update(id: string, dto: UpdateUserDto, currentUser: UserContext) {
    // Find the user
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { tenant: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if current user can access this user's tenant
    if (!this.rbacService.canAccessTenant(currentUser, user.tenantId)) {
      throw new ForbiddenException('Cannot update user in this tenant');
    }

    // Only ADMIN can change roles
    if (dto.role && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only ADMIN can change user roles');
    }

    // Only ADMIN can change tenants
    if (dto.tenantId && dto.tenantId !== user.tenantId) {
      if (currentUser.role !== Role.ADMIN) {
        throw new ForbiddenException('Only ADMIN can change user tenants');
      }

      // Validate the new tenant exists
      const newTenant = await this.prisma.tenant.findUnique({
        where: { id: dto.tenantId },
      });

      if (!newTenant) {
        throw new NotFoundException('Target tenant not found');
      }

      // Log tenant change for debugging
      this.logger.log(
        `Changing user ${user.email} tenant from ${user.tenantId} to ${dto.tenantId}`,
      );
    }

    // Prevent ADMIN from changing their own role to non-ADMIN
    if (
      dto.role &&
      currentUser.id === id &&
      currentUser.role === Role.ADMIN &&
      dto.role !== Role.ADMIN
    ) {
      throw new BadRequestException('Cannot demote yourself from ADMIN role');
    }

    // If email is being changed, check it doesn't conflict
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new BadRequestException('User with this email already exists');
      }
    }

    // Sync changes to Auth0 if user has auth0Id and email/name changed
    if (user.auth0Id && (dto.email || dto.name)) {
      try {
        this.logger.log(`Syncing user changes to Auth0: ${user.auth0Id}`);
        await this.auth0Management.updateUser(user.auth0Id, {
          ...(dto.email && { email: dto.email }),
          ...(dto.name && { name: dto.name }),
        });
        this.logger.log(`✅ User synced to Auth0`);
      } catch (error: any) {
        this.logger.warn(`Failed to sync user to Auth0: ${error.message}`);
        // Continue with database update even if Auth0 sync fails
      }
    }

    // Update user
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email && { email: dto.email }),
        ...(dto.name && { name: dto.name }),
        ...(dto.role && { role: dto.role }),
        ...(dto.tenantId && { tenantId: dto.tenantId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.auth0Id && { auth0Id: dto.auth0Id }),
      },
      include: {
        tenant: true,
      },
    });

    this.logger.log(`✅ User updated in database: ${updatedUser.email}`);

    // Apply field filtering
    return this.rbacService.filterFieldsByRole(currentUser, updatedUser);
  }

  /**
   * Delete a user
   * Only ADMIN can delete users
   *
   * IMPORTANT: Also deletes user from Auth0
   */
  async delete(id: string, currentUser: UserContext) {
    // Only ADMIN can delete
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only ADMIN can delete users');
    }

    // Find the user
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent self-deletion
    if (currentUser.id === id) {
      throw new BadRequestException('Cannot delete yourself');
    }

    // Delete from Auth0 if auth0Id exists
    if (user.auth0Id) {
      try {
        this.logger.log(`Deleting user from Auth0: ${user.auth0Id}`);
        await this.auth0Management.deleteUser(user.auth0Id);
        this.logger.log(`✅ User deleted from Auth0`);
      } catch (error: any) {
        this.logger.warn(`Failed to delete user from Auth0: ${error.message}`);
        // Continue with database deletion even if Auth0 deletion fails
      }
    }

    // Delete the user from database
    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`✅ User deleted from database: ${user.email}`);

    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Get a single user by ID
   */
  async findOne(id: string, currentUser: UserContext) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        tenant: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if current user can access this user's tenant
    if (!this.rbacService.canAccessTenant(currentUser, user.tenantId)) {
      throw new ForbiddenException('Cannot access user in this tenant');
    }

    // Apply field filtering
    return this.rbacService.filterFieldsByRole(currentUser, user);
  }
}
