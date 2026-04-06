import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
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
import { AuthService } from './auth.service';
import { UserContext } from './types/user-context.interface';
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
      required: ['access_token'],
      properties: {
        access_token: {
          type: 'string',
          description: 'Access token from Auth0 (frontend exchanges code with PKCE)',
          example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
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
    description: 'Authentication failed - invalid token',
  })
  @Public()
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Body('access_token') accessToken: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<UserContext> {
    if (!accessToken) {
      throw new UnauthorizedException('Access token is required');
    }

    // Verify token signature
    const auth0Payload = await this.authService.verifyToken(accessToken);

    // Fetch user profile from Auth0 /userinfo endpoint
    // Access tokens don't include email/name claims, so we need to fetch them
    const userInfo = await this.authService.getUserInfo(accessToken);

    // Merge token payload with user info
    const completePayload = {
      ...auth0Payload,
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
    };

    // Get or create user in database
    const user = await this.authService.getOrCreateUser(completePayload);

    // Set HTTP-only cookie with the access token
    const isProduction = this.configService.get('nodeEnv') === 'production';
    reply.setCookie('access_token', accessToken, {
      httpOnly: true, // CRITICAL: Cannot be accessed by JavaScript
      secure: isProduction, // HTTPS only in production
      sameSite: isProduction ? 'none' : 'lax', // 'lax' for development (localhost), 'none' for production (cross-domain)
      maxAge: auth0Payload.exp - Math.floor(Date.now() / 1000), // Time until token expires
      path: '/',
    });

    // Return user profile (NOT the tokens)
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

    reply.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.configService.get('nodeEnv') === 'production',
      sameSite: 'none',
      path: '/auth',
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

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Uses the refresh_token cookie to obtain a new access token. Automatically called by frontend before token expiration.',
  })
  @ApiCookieAuth('refresh_token')
  @ApiResponse({
    status: 200,
    description: 'Successfully refreshed. New access_token cookie set.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        expiresIn: { type: 'number', example: 3600 },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - no valid refresh_token cookie present',
  })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ success: boolean; expiresIn: number }> {
    const refreshToken = request.cookies['refresh_token'];

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    // Get new access token using refresh token
    const tokens = await this.authService.refreshAccessToken(refreshToken);

    // Set new access token cookie
    const isProduction = this.configService.get('nodeEnv') === 'production';
    reply.setCookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: tokens.expires_in,
      path: '/',
    });

    return {
      success: true,
      expiresIn: tokens.expires_in,
    };
  }
}
