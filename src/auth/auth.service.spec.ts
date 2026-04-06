import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma.service';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';

jest.mock('jsonwebtoken');
jest.mock('jwks-rsa');

// Mock global fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('AuthService', () => {
  let service: AuthService;
  let configService: ConfigService;
  let prisma: PrismaService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        'auth0.domain': 'test-tenant.auth0.com',
        'auth0.clientId': 'test-client-id',
        'auth0.clientSecret': 'test-client-secret',
        'auth0.audience': 'https://api.test.local',
        'frontend.url': 'http://localhost:5173',
      };
      return config[key];
    }),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    // Mock jwksClient constructor
    (jwksClient as any).mockImplementation(() => ({
      getSigningKey: jest.fn().mockResolvedValue({
        getPublicKey: () => 'mock-public-key',
      }),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange authorization code for tokens', async () => {
      const mockTokenResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      } as any;

      (global.fetch as jest.Mock).mockResolvedValue(mockTokenResponse);

      const result = await service.exchangeCodeForToken('auth-code-123');

      expect(result).toEqual({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-tenant.auth0.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should request offline_access scope for refresh token', async () => {
      const mockTokenResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
        }),
      } as any;

      (global.fetch as jest.Mock).mockResolvedValue(mockTokenResponse);

      await service.exchangeCodeForToken('auth-code-123');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      expect(requestBody.scope).toContain('offline_access');
    });

    it('should handle exchange errors', async () => {
      const mockErrorResponse = {
        ok: false,
        text: jest.fn().mockResolvedValue('Invalid authorization code'),
      } as any;

      (global.fetch as jest.Mock).mockResolvedValue(mockErrorResponse);

      await expect(service.exchangeCodeForToken('invalid-code')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token using refresh token', async () => {
      const mockRefreshResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      } as any;

      (global.fetch as jest.Mock).mockResolvedValue(mockRefreshResponse);

      const result = await service.refreshAccessToken('mock-refresh-token');

      expect(result).toEqual({
        access_token: 'new-access-token',
        expires_in: 3600,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-tenant.auth0.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should throw error if refresh token is expired', async () => {
      const mockErrorResponse = {
        ok: false,
        text: jest.fn().mockResolvedValue('Refresh token is expired'),
      } as any;

      (global.fetch as jest.Mock).mockResolvedValue(mockErrorResponse);

      await expect(service.refreshAccessToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify valid JWT token', async () => {
      const mockDecodedToken = {
        sub: 'auth0|123456',
        email: 'user@example.com',
        name: 'Test User',
        aud: 'https://api.test.local',
        iss: 'https://test-tenant.auth0.com/',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: 'test-key-id' },
        payload: mockDecodedToken,
      });

      (jwt.verify as jest.Mock).mockReturnValue(mockDecodedToken);

      const result = await service.verifyToken('valid-jwt-token');

      expect(result).toEqual(mockDecodedToken);
    });

    it('should throw error for expired token', async () => {
      const mockError = new Error('jwt expired');
      mockError.name = 'TokenExpiredError';

      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: 'test-key-id' },
        payload: {},
      });

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw mockError;
      });

      await expect(service.verifyToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for invalid token signature', async () => {
      const mockError = new Error('invalid signature');
      mockError.name = 'JsonWebTokenError';

      (jwt.decode as jest.Mock).mockReturnValue({
        header: { kid: 'test-key-id' },
        payload: {},
      });

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw mockError;
      });

      await expect(service.verifyToken('tampered-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getOrCreateUser', () => {
    it('should return existing user from database', async () => {
      const mockAuth0Payload = {
        sub: 'auth0|123456',
        email: 'existing@example.com',
        name: 'Existing User',
      };

      const mockUser = {
        id: 'user-id-123',
        auth0Id: 'auth0|123456',
        email: 'existing@example.com',
        name: 'Existing User',
        role: 'MANAGER',
        tenantId: 'tenant-a',
        isActive: true,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getOrCreateUser(mockAuth0Payload);

      expect(result).toEqual({
        id: 'user-id-123',
        auth0Id: 'auth0|123456',
        email: 'existing@example.com',
        name: 'Existing User',
        role: 'MANAGER',
        tenantId: 'tenant-a',
      });

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'existing@example.com' },
        include: { tenant: true },
      });
    });

    it('should throw error if user not found in database', async () => {
      const mockAuth0Payload = {
        sub: 'auth0|new-user',
        email: 'new@example.com',
        name: 'New User',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getOrCreateUser(mockAuth0Payload)).rejects.toThrow(UnauthorizedException);
    });

    it('should update auth0Id if not set', async () => {
      const mockAuth0Payload = {
        sub: 'auth0|123456',
        email: 'existing@example.com',
        name: 'Existing User',
      };

      const mockUserWithoutAuth0Id = {
        id: 'user-id-123',
        auth0Id: null,
        email: 'existing@example.com',
        name: 'Existing User',
        role: 'MANAGER',
        tenantId: 'tenant-a',
        isActive: true,
      };

      const mockUpdatedUser = {
        ...mockUserWithoutAuth0Id,
        auth0Id: 'auth0|123456',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUserWithoutAuth0Id);
      mockPrismaService.user.update.mockResolvedValue(mockUpdatedUser);

      await service.getOrCreateUser(mockAuth0Payload);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-123' },
        data: { auth0Id: 'auth0|123456' },
        include: { tenant: true },
      });
    });

    it('should throw error if user is inactive', async () => {
      const mockAuth0Payload = {
        sub: 'auth0|123456',
        email: 'inactive@example.com',
        name: 'Inactive User',
      };

      const mockInactiveUser = {
        id: 'user-id-123',
        auth0Id: 'auth0|123456',
        email: 'inactive@example.com',
        name: 'Inactive User',
        role: 'MANAGER',
        tenantId: 'tenant-a',
        isActive: false,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockInactiveUser);

      await expect(service.getOrCreateUser(mockAuth0Payload)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return correct expiration time', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      (jwt.decode as jest.Mock).mockReturnValue({
        exp: futureTimestamp,
      });

      const result = service.getTokenExpiration('valid-token');

      expect(result).toBeGreaterThan(3500); // Should be close to 3600
      expect(result).toBeLessThanOrEqual(3600);
    });

    it('should return default expiration if token has no exp claim', () => {
      (jwt.decode as jest.Mock).mockReturnValue({});

      const result = service.getTokenExpiration('token-without-exp');

      expect(result).toBe(3600);
    });

    it('should return default expiration if decoding fails', () => {
      (jwt.decode as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = service.getTokenExpiration('invalid-token');

      expect(result).toBe(3600);
    });
  });
});
