import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserContext } from '../auth.service';

/**
 * Extract current user from request
 * Usage: @CurrentUser() user: UserContext
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
