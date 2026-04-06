import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { PrismaService } from '../common/prisma.service';
import { UserContext } from './types/user-context.interface';
import { Role } from '../rbac/enums/roles.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private jwksClient: jwksClient.JwksClient;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const auth0Domain = this.configService.get<string>('auth0.domain');
    this.jwksClient = jwksClient({
      jwksUri: `https://${auth0Domain}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true,
    });
  }

  /**
   * Exchange Auth0 authorization code for access token and refresh token
   */
  async exchangeCodeForToken(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }> {
    const auth0Domain = this.configService.get<string>('auth0.domain');
    const clientId = this.configService.get<string>('auth0.clientId');
    const clientSecret = this.configService.get<string>('auth0.clientSecret');
    const audience = this.configService.get<string>('auth0.audience');
    const frontendUrl = this.configService.get<string>('frontend.url');

    const tokenEndpoint = `https://${auth0Domain}/oauth/token`;

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${frontendUrl}/callback`,
        audience,
        scope: 'openid profile email offline_access', // offline_access for refresh token
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new UnauthorizedException(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in || 3600,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    expires_in: number;
  }> {
    const auth0Domain = this.configService.get<string>('auth0.domain');
    const clientId = this.configService.get<string>('auth0.clientId');
    const clientSecret = this.configService.get<string>('auth0.clientSecret');

    const tokenEndpoint = `https://${auth0Domain}/oauth/token`;

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new UnauthorizedException(`Token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
    };
  }

  /**
   * Verify JWT token using Auth0 JWKS
   */
  async verifyToken(token: string): Promise<any> {
    try {
      const decodedToken = jwt.decode(token, { complete: true });
      if (!decodedToken || typeof decodedToken === 'string') {
        throw new UnauthorizedException('Invalid token structure');
      }

      const kid = decodedToken.header.kid;
      if (!kid) {
        throw new UnauthorizedException('Token missing key ID');
      }

      const key = await this.jwksClient.getSigningKey(kid);
      const signingKey = key.getPublicKey();

      const audience = this.configService.get<string>('auth0.audience');
      const auth0Domain = this.configService.get<string>('auth0.domain');

      const verified = jwt.verify(token, signingKey, {
        audience,
        issuer: `https://${auth0Domain}/`,
        algorithms: ['RS256'],
      });

      return verified;
    } catch (error: any) {
      throw new UnauthorizedException(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Get user info from Auth0 /userinfo endpoint
   * This is needed because access tokens don't include profile claims
   */
  async getUserInfo(accessToken: string): Promise<any> {
    const auth0Domain = this.configService.get<string>('auth0.domain');
    const userInfoEndpoint = `https://${auth0Domain}/userinfo`;

    try {
      const response = await fetch(userInfoEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.statusText}`);
      }

      const userInfo = await response.json();
      return userInfo;
    } catch (error: any) {
      this.logger.error('Failed to fetch user info from Auth0:', error.message);
      throw new UnauthorizedException(`Failed to get user info: ${error.message}`);
    }
  }

  /**
   * Get user from database by Auth0 ID (for JWT guard)
   * Does NOT create user - only looks up existing users
   */
  async getUserByAuth0Id(auth0Id: string): Promise<UserContext | null> {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
      include: { tenant: true },
    });

    if (!user) {
      return null;
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      tenantId: user.tenantId,
      auth0Id: user.auth0Id!,
    };
  }

  /**
   * Get or create user from Auth0 token (JIT Provisioning)
   *
   * If user exists in database: return user
   * If user doesn't exist: auto-create with VIEWER role in default tenant
   */
  async getOrCreateUser(auth0Payload: any): Promise<UserContext> {
    const auth0Id = auth0Payload.sub;
    const email = auth0Payload.email || auth0Payload[`${this.configService.get('auth0.audience')}/email`];
    const name = auth0Payload.name || auth0Payload[`${this.configService.get('auth0.audience')}/name`] || email;

    if (!email) {
      throw new UnauthorizedException('Email not found in token');
    }

    // Look up user in local database by Auth0 ID first, then by email
    let user = await this.prisma.user.findUnique({
      where: { auth0Id },
      include: { tenant: true },
    });

    if (!user) {
      // Try finding by email
      user = await this.prisma.user.findUnique({
        where: { email },
        include: { tenant: true },
      });
    }

    // JIT Provisioning: Create user if doesn't exist
    if (!user) {
      this.logger.log(`🆕 JIT Provisioning: Creating new user ${email}`);

      // Get default tenant (first tenant for JIT users)
      const defaultTenant = await this.prisma.tenant.findFirst();

      if (!defaultTenant) {
        throw new UnauthorizedException(
          'No tenants configured in system. Please contact administrator.',
        );
      }

      // Create new user with default role (VIEWER)
      user = await this.prisma.user.create({
        data: {
          email,
          name,
          auth0Id,
          role: 'VIEWER', // Default role for JIT provisioned users
          tenantId: defaultTenant.id,
          isActive: true,
        },
        include: { tenant: true },
      });

      this.logger.log(`✅ JIT Provisioning successful: ${email} -> ${user.role} in ${defaultTenant.name}`);
    }

    // Update auth0Id if not set (for users created before Auth0 integration)
    if (!user.auth0Id) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { auth0Id },
        include: { tenant: true },
      });
      this.logger.log(`✅ Linked Auth0 ID to existing user: ${email}`);
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      tenantId: user.tenantId,
      auth0Id: user.auth0Id!,
    };
  }

  /**
   * Get token expiration in seconds
   */
  getTokenExpiration(token: string): number {
    try {
      const decoded: any = jwt.decode(token);
      if (decoded && decoded.exp) {
        const now = Math.floor(Date.now() / 1000);
        return decoded.exp - now;
      }
      return 3600; // Default 1 hour
    } catch {
      return 3600;
    }
  }
}
