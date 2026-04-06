import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/roles.enum';

/**
 * Metadata key for storing required roles
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles can access an endpoint
 *
 * Usage:
 * @Roles(Role.ADMIN, Role.MANAGER)
 * async someMethod() { ... }
 *
 * @param roles - One or more roles that are allowed to access the endpoint
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
