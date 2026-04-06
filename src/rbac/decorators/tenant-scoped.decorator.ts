import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for tenant-scoped endpoints
 */
export const TENANT_SCOPED_KEY = 'tenantScoped';

/**
 * Decorator to mark an endpoint as requiring tenant-based filtering
 *
 * When applied, the endpoint will automatically filter data to only show
 * records from the user's tenant (unless the user is an ADMIN).
 *
 * Usage:
 * @TenantScoped()
 * @Get()
 * async findAll() { ... }
 */
export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);
