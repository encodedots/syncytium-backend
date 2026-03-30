import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService, UserContext } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  /**
   * POST /auth/callback
   * Exchange Auth0 authorization code for access token and set HTTP-only cookie
   */
  @ApiOperation({
    summary: 'Exchange Auth0 authorization code for session',
    description:
      'Exchanges Auth0 authorization code for access token and sets HTTP-only cookie. Called by frontend after Auth0 redirect.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description: 'Authorization code from Auth0 callback URL',
          example: 'AUTH0_AUTHORIZATION_CODE',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated. Returns user profile and sets access_token cookie.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'uuid' },
        email: { type: 'string', example: 'admin@example.com' },
        name: { type: 'string', example: 'Admin User' },
        role: { type: 'string', example: 'ADMIN' },
        tenantId: { type: 'string', example: 'tenant-a-id' },
        auth0Id: { type: 'string', example: 'auth0|123456' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication failed - invalid code or token verification failed',
  })
  @Public()
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Body('code') code: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<UserContext> {
    if (!code) {
      throw new Error('Authorization code is required');
    }

    // Exchange code for token
    const accessToken = await this.authService.exchangeCodeForToken(code);

    // Verify token and get/create user
    const auth0Payload = await this.authService.verifyToken(accessToken);
    const user = await this.authService.getOrCreateUser(auth0Payload);

    // Get token expiration
    const expiresIn = this.authService.getTokenExpiration(accessToken);

    // Set HTTP-only cookie with the access token
    reply.setCookie('access_token', accessToken, {
      httpOnly: true, // CRITICAL: Cannot be accessed by JavaScript
      secure: this.configService.get('nodeEnv') === 'production', // HTTPS only in production
      sameSite: 'none', // Required for cross-domain
      maxAge: expiresIn, // Seconds (from token expiration)
      path: '/',
    });

    // Return user profile (NOT the token)
    return user;
  }

  /**
   * POST /auth/logout
   * Clear authentication cookie
   */
  @ApiOperation({
    summary: 'Logout user',
    description: 'Clears the HTTP-only access_token cookie, effectively logging out the user.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'Successfully logged out',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) reply: FastifyReply): { success: boolean } {
    reply.clearCookie('access_token', {
      httpOnly: true,
      secure: this.configService.get('nodeEnv') === 'production',
      sameSite: 'none',
      path: '/',
    });

    return { success: true };
  }

  /**
   * GET /auth/me
   * Get current authenticated user profile
   */
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the authenticated user profile. Requires access_token cookie to be present.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'uuid' },
        email: { type: 'string', example: 'admin@example.com' },
        name: { type: 'string', example: 'Admin User' },
        role: { type: 'string', example: 'ADMIN' },
        tenantId: { type: 'string', example: 'tenant-a-id' },
        auth0Id: { type: 'string', example: 'auth0|123456' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - no valid access_token cookie present',
  })
  @Get('me')
  me(@CurrentUser() user: UserContext): UserContext {
    return user;
  }
}
