import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { RolesGuard } from './guards/roles.guard';

/**
 * RBAC Module - Role-Based Access Control
 *
 * This module provides:
 * - RbacService for permission checking and tenant filtering
 * - RolesGuard for enforcing role-based access on endpoints
 * - Decorators: @Roles() and @TenantScoped()
 *
 * Marked as @Global() so all modules can use RBAC features
 * without importing this module explicitly.
 */
@Global()
@Module({
  providers: [
    RbacService,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [RbacService],
})
export class RbacModule {}
