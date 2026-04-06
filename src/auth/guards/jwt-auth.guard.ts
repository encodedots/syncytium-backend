import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // CRITICAL: Extract JWT from cookie (NOT Authorization header)
    const token = this.extractTokenFromCookie(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token found');
    }

    try {
      // Verify token with Auth0 JWKS
      const auth0Payload = await this.authService.verifyToken(token);

      // Get user from local database (no JIT provisioning - user must exist)
      const user = await this.authService.getUserByAuth0Id(auth0Payload.sub);

      if (!user) {
        throw new UnauthorizedException(
          'User not found. Please complete the login flow at /auth/callback first.',
        );
      }

      // Attach user context to request
      (request as any).user = user;

      return true;
    } catch (error: any) {
      throw new UnauthorizedException(error.message || 'Invalid authentication token');
    }
  }

  /**
   * CRITICAL: Extract JWT from HTTP-only cookie
   * This is the security boundary - tokens MUST come from cookies, not localStorage
   */
  private extractTokenFromCookie(request: FastifyRequest): string | undefined {
    const cookies = request.cookies;

    if (!cookies || !cookies.access_token) {
      return undefined;
    }

    return cookies.access_token;
  }
}
