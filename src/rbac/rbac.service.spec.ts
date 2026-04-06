import { Test, TestingModule } from '@nestjs/testing';
import { RbacService } from './rbac.service';
import { PrismaService } from '../common/prisma.service';
import { Role } from './enums/roles.enum';
import { UserContext } from '../auth/types/user-context.interface';

describe('RbacService', () => {
  let service: RbacService;
  let prisma: PrismaService;

  const mockPrismaService = {
    tenant: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canAccessTenant', () => {
    it('should allow ADMIN to access any tenant', () => {
      const adminUser: UserContext = {
        id: 'admin-id',
        auth0Id: 'auth0|admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: Role.ADMIN,
        tenantId: 'tenant-a',
      };

      expect(service.canAccessTenant(adminUser, 'tenant-a')).toBe(true);
      expect(service.canAccessTenant(adminUser, 'tenant-b')).toBe(true);
      expect(service.canAccessTenant(adminUser, 'tenant-c')).toBe(true);
    });

    it('should allow MANAGER to access only their own tenant', () => {
      const managerUser: UserContext = {
        id: 'manager-id',
        auth0Id: 'auth0|manager',
        email: 'manager@example.com',
        name: 'Manager User',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      expect(service.canAccessTenant(managerUser, 'tenant-a')).toBe(true);
      expect(service.canAccessTenant(managerUser, 'tenant-b')).toBe(false);
    });

    it('should allow VIEWER to access only their own tenant', () => {
      const viewerUser: UserContext = {
        id: 'viewer-id',
        auth0Id: 'auth0|viewer',
        email: 'viewer@example.com',
        name: 'Viewer User',
        role: Role.VIEWER,
        tenantId: 'tenant-a',
      };

      expect(service.canAccessTenant(viewerUser, 'tenant-a')).toBe(true);
      expect(service.canAccessTenant(viewerUser, 'tenant-b')).toBe(false);
    });
  });

  describe('canAccessRecord', () => {
    it('should allow access if record tenant matches user tenant', () => {
      const user: UserContext = {
        id: 'user-id',
        auth0Id: 'auth0|user',
        email: 'user@example.com',
        name: 'User',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const record = {
        id: 'record-1',
        tenantId: 'tenant-a',
        title: 'Test Record',
      };

      expect(service.canAccessRecord(user, record)).toBe(true);
    });

    it('should deny access if record tenant does not match user tenant', () => {
      const user: UserContext = {
        id: 'user-id',
        auth0Id: 'auth0|user',
        email: 'user@example.com',
        name: 'User',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const record = {
        id: 'record-1',
        tenantId: 'tenant-b',
        title: 'Test Record',
      };

      expect(service.canAccessRecord(user, record)).toBe(false);
    });

    it('should allow ADMIN to access records from any tenant', () => {
      const adminUser: UserContext = {
        id: 'admin-id',
        auth0Id: 'auth0|admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: Role.ADMIN,
        tenantId: 'tenant-a',
      };

      const recordB = {
        id: 'record-1',
        tenantId: 'tenant-b',
        title: 'Test Record',
      };

      expect(service.canAccessRecord(adminUser, recordB)).toBe(true);
    });
  });

  describe('filterFieldsByRole', () => {
    it('should return full record for ADMIN', () => {
      const adminUser: UserContext = {
        id: 'admin-id',
        auth0Id: 'auth0|admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: Role.ADMIN,
        tenantId: 'tenant-a',
      };

      const record = {
        id: 'record-1',
        tenantId: 'tenant-a',
        title: 'Test Record',
        sensitiveField: 'sensitive data',
        assignedUser: {
          id: 'user-1',
          email: 'assigned@example.com',
        },
      };

      const filtered = service.filterFieldsByRole(adminUser, record);
      expect(filtered).toEqual(record);
      expect(filtered.assignedUser).toBeDefined();
    });

    it('should return full record for MANAGER', () => {
      const managerUser: UserContext = {
        id: 'manager-id',
        auth0Id: 'auth0|manager',
        email: 'manager@example.com',
        name: 'Manager User',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const record = {
        id: 'record-1',
        tenantId: 'tenant-a',
        title: 'Test Record',
        sensitiveField: 'sensitive data',
        assignedUser: {
          id: 'user-1',
          email: 'assigned@example.com',
        },
      };

      const filtered = service.filterFieldsByRole(managerUser, record);
      expect(filtered).toEqual(record);
      expect(filtered.assignedUser).toBeDefined();
    });

    it('should strip assignedUser details for VIEWER', () => {
      const viewerUser: UserContext = {
        id: 'viewer-id',
        auth0Id: 'auth0|viewer',
        email: 'viewer@example.com',
        name: 'Viewer User',
        role: Role.VIEWER,
        tenantId: 'tenant-a',
      };

      const record = {
        id: 'record-1',
        tenantId: 'tenant-a',
        title: 'Test Record',
        sensitiveField: 'sensitive data',
        assignedUser: {
          id: 'user-1',
          email: 'assigned@example.com',
        },
      };

      const filtered = service.filterFieldsByRole(viewerUser, record);
      expect(filtered.id).toBe('record-1');
      expect(filtered.title).toBe('Test Record');
      expect(filtered.assignedUser).toBeUndefined();
    });
  });

  describe('getVisibleTenants', () => {
    it('should return all tenant IDs for ADMIN', async () => {
      const adminUser: UserContext = {
        id: 'admin-id',
        auth0Id: 'auth0|admin',
        email: 'admin@example.com',
        name: 'Admin User',
        role: Role.ADMIN,
        tenantId: 'tenant-a',
      };

      mockPrismaService.tenant.findMany.mockResolvedValue([
        { id: 'tenant-a', name: 'Tenant A' },
        { id: 'tenant-b', name: 'Tenant B' },
        { id: 'tenant-c', name: 'Tenant C' },
      ]);

      const tenants = await service.getVisibleTenants(adminUser);
      expect(tenants).toEqual(['tenant-a', 'tenant-b', 'tenant-c']);
      expect(mockPrismaService.tenant.findMany).toHaveBeenCalled();
    });

    it('should return only user tenant ID for MANAGER', async () => {
      const managerUser: UserContext = {
        id: 'manager-id',
        auth0Id: 'auth0|manager',
        email: 'manager@example.com',
        name: 'Manager User',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const tenants = await service.getVisibleTenants(managerUser);
      expect(tenants).toEqual(['tenant-a']);
      expect(mockPrismaService.tenant.findMany).not.toHaveBeenCalled();
    });

    it('should return only user tenant ID for VIEWER', async () => {
      const viewerUser: UserContext = {
        id: 'viewer-id',
        auth0Id: 'auth0|viewer',
        email: 'viewer@example.com',
        name: 'Viewer User',
        role: Role.VIEWER,
        tenantId: 'tenant-b',
      };

      const tenants = await service.getVisibleTenants(viewerUser);
      expect(tenants).toEqual(['tenant-b']);
      expect(mockPrismaService.tenant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Security Boundary Tests', () => {
    it('should prevent tenant isolation breach', () => {
      const managerA: UserContext = {
        id: 'manager-a-id',
        auth0Id: 'auth0|manager-a',
        email: 'manager-a@example.com',
        name: 'Manager A',
        role: Role.MANAGER,
        tenantId: 'tenant-a',
      };

      const recordFromTenantB = {
        id: 'record-b-1',
        tenantId: 'tenant-b',
        title: 'Confidential Record',
      };

      // Manager A should NOT be able to access Tenant B's record
      expect(service.canAccessRecord(managerA, recordFromTenantB)).toBe(false);
    });

    it('should prevent field leakage for VIEWER role', () => {
      const viewer: UserContext = {
        id: 'viewer-id',
        auth0Id: 'auth0|viewer',
        email: 'viewer@example.com',
        name: 'Viewer',
        role: Role.VIEWER,
        tenantId: 'tenant-a',
      };

      const sensitiveRecord = {
        id: 'record-1',
        tenantId: 'tenant-a',
        title: 'Public Title',
        assignedUser: {
          id: 'user-1',
          email: 'sensitive@example.com',
          phoneNumber: '+1234567890',
        },
      };

      const filtered = service.filterFieldsByRole(viewer, sensitiveRecord);
      expect(filtered.assignedUser).toBeUndefined();
    });
  });
});
