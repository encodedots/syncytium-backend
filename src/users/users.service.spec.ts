import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { Role } from '../rbac/enums/roles.enum';
import { UserContext } from '../auth/types/user-context.interface';
import { PaginationDto } from '../common/dto/pagination.dto';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;
  let rbacService: RbacService;

  const mockPrismaService = {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockRbacService = {
    getVisibleTenants: jest.fn(),
    filterFieldsByRole: jest.fn((user, record) => record),
    canAccessRecord: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RbacService,
          useValue: mockRbacService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    rbacService = module.get<RbacService>(RbacService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated users for ADMIN (all tenants)', async () => {
      const adminUser: UserContext = {
        id: 'admin-id',
        auth0Id: 'auth0|admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: Role.ADMIN,
        tenantId: 'tenant-a',
      };

      const pagination: PaginationDto = {
        page: 1,
        limit: 20,
        skip: 0,
        take: 20,
      };

      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@tenant-a.com',
          name: 'User 1',
          tenantId: 'tenant-a',
          role: Role.MANAGER,
          tenant: { id: 'tenant-a', name: 'Tenant A' },
        },
        {
          id: 'user-2',
          email: 'user2@tenant-b.com',
          name: 'User 2',
          tenantId: 'tenant-b',
          role: Role.MANAGER,
          tenant: { id: 'tenant-b', name: 'Tenant B' },
        },
      ];

      mockRbacService.getVisibleTenants.mockResolvedValue(['tenant-a', 'tenant-b', 'tenant-c']);
      mockPrismaService.user.count.mockResolvedValue(2);
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.findAll(adminUser, pagination);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should return paginated users for MANAGER (own tenant only)', async () => {
      const managerUser: UserContext = {
        id: 'manager-id',
        auth0Id: 'auth0|manager',
        email: 'manager@example.com',
        name: 'Manager User',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const pagination: PaginationDto = {
        page: 1,
        limit: 20,
        skip: 0,
        take: 20,
      };

      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@tenant-a.com',
          name: 'User 1',
          tenantId: 'tenant-a',
          role: Role.VIEWER,
          tenant: { id: 'tenant-a', name: 'Tenant A' },
        },
      ];

      mockRbacService.getVisibleTenants.mockResolvedValue(['tenant-a']);
      mockPrismaService.user.count.mockResolvedValue(1);
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.findAll(managerUser, pagination);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].tenantId).toBe('tenant-a');
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: { in: ['tenant-a'] } },
        }),
      );
    });

    it('should apply pagination correctly', async () => {
      const managerUser: UserContext = {
        id: 'manager-id',
        auth0Id: 'auth0|manager',
        email: 'manager@example.com',
        name: 'Manager User',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const pagination: PaginationDto = {
        page: 2,
        limit: 10,
        skip: 10,
        take: 10,
      };

      mockRbacService.getVisibleTenants.mockResolvedValue(['tenant-a']);
      mockPrismaService.user.count.mockResolvedValue(25);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.findAll(managerUser, pagination);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('should filter fields based on role', async () => {
      const viewerUser: UserContext = {
        id: 'viewer-id',
        auth0Id: 'auth0|viewer',
        email: 'viewer@example.com',
        name: 'Viewer User',
        role: Role.VIEWER,
        tenantId: 'tenant-a',
      };

      const pagination: PaginationDto = {
        page: 1,
        limit: 20,
        skip: 0,
        take: 20,
      };

      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@tenant-a.com',
          name: 'User 1',
          tenantId: 'tenant-a',
          role: Role.MANAGER,
          sensitiveField: 'should be filtered',
          tenant: { id: 'tenant-a', name: 'Tenant A' },
        },
      ];

      mockRbacService.getVisibleTenants.mockResolvedValue(['tenant-a']);
      mockPrismaService.user.count.mockResolvedValue(1);
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);
      mockRbacService.filterFieldsByRole.mockImplementation((user, record) => {
        const { sensitiveField, ...safe } = record;
        return safe;
      });

      const result = await service.findAll(viewerUser, pagination);

      expect(mockRbacService.filterFieldsByRole).toHaveBeenCalledWith(viewerUser, mockUsers[0]);
      expect(result.data[0]).not.toHaveProperty('sensitiveField');
    });

    it('should return correct pagination metadata for last page', async () => {
      const managerUser: UserContext = {
        id: 'manager-id',
        auth0Id: 'auth0|manager',
        email: 'manager@example.com',
        name: 'Manager User',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const pagination: PaginationDto = {
        page: 3,
        limit: 10,
        skip: 20,
        take: 10,
      };

      mockRbacService.getVisibleTenants.mockResolvedValue(['tenant-a']);
      mockPrismaService.user.count.mockResolvedValue(25);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.findAll(managerUser, pagination);

      expect(result.pagination.page).toBe(3);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('should handle empty results', async () => {
      const managerUser: UserContext = {
        id: 'manager-id',
        auth0Id: 'auth0|manager',
        email: 'manager@example.com',
        name: 'Manager User',
        role: Role.MANAGER,
        tenantId: 'tenant-empty',
      };

      const pagination: PaginationDto = {
        page: 1,
        limit: 20,
        skip: 0,
        take: 20,
      };

      mockRbacService.getVisibleTenants.mockResolvedValue(['tenant-empty']);
      mockPrismaService.user.count.mockResolvedValue(0);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.findAll(managerUser, pagination);

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe('Security Boundary Tests', () => {
    it('should prevent cross-tenant data access', async () => {
      const managerA: UserContext = {
        id: 'manager-a-id',
        auth0Id: 'auth0|manager-a',
        email: 'manager-a@example.com',
        name: 'Manager A',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const pagination: PaginationDto = {
        page: 1,
        limit: 20,
        skip: 0,
        take: 20,
      };

      mockRbacService.getVisibleTenants.mockResolvedValue(['tenant-a']);
      mockPrismaService.user.count.mockResolvedValue(0);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.findAll(managerA, pagination);

      // Verify query only includes tenant-a
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: { in: ['tenant-a'] } },
        }),
      );
    });

    it('should respect pagination limits (max 100)', async () => {
      const adminUser: UserContext = {
        id: 'admin-id',
        auth0Id: 'auth0|admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: Role.ADMIN,
        tenantId: 'tenant-a',
      };

      const pagination: PaginationDto = {
        page: 1,
        limit: 100,
        skip: 0,
        take: 100,
      };

      mockRbacService.getVisibleTenants.mockResolvedValue(['tenant-a']);
      mockPrismaService.user.count.mockResolvedValue(50);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.findAll(adminUser, pagination);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });
});
