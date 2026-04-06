import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { Role } from '../enums/roles.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserContext } from '../../auth/types/user-context.interface';

/**
 * RolesGuard - Enforces role-based access control
 *
 * Checks if the authenticated user has one of the required roles
 * specified by the @Roles() decorator.
 *
 * This guard runs AFTER JwtAuthGuard, so request.user is guaranteed
 * to be populated.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from @Roles() decorator metadata
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Get user from request (populated by JwtAuthGuard)
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = (request as any).user as UserContext;

    // User should always be present due to JwtAuthGuard, but double-check
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check if user has one of the required roles
    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
