import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { PrismaService } from '../common/prisma.service';

export interface UserContext {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  auth0Id: string;
}

@Injectable()
export class AuthService {
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
   * Exchange Auth0 authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<string> {
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
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new UnauthorizedException(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    return data.access_token;
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
   * Get or create user from Auth0 token
   */
  async getOrCreateUser(auth0Payload: any): Promise<UserContext> {
    const auth0Id = auth0Payload.sub;
    const email = auth0Payload.email || auth0Payload[`${this.configService.get('auth0.audience')}/email`];
    const name = auth0Payload.name || auth0Payload[`${this.configService.get('auth0.audience')}/name`] || email;

    if (!email) {
      throw new UnauthorizedException('Email not found in token');
    }

    // Look up user in local database by email
    let user = await this.prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException(
        'User not found in system. Please contact your administrator.',
      );
    }

    // Update auth0Id if not set
    if (!user.auth0Id) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { auth0Id },
        include: { tenant: true },
      });
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
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
