import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public (bypass JWT authentication)
 * Usage: @Public()
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
