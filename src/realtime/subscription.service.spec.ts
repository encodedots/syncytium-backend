import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService } from './subscription.service';
import { RedisSubscriptionStore } from './redis-subscription.store';
import { Role } from '../rbac/enums/roles.enum';
import { WalEvent, WalOperation } from './types/wal-event.interface';

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  const mockRedisStore = {
    isAvailable: jest.fn().mockReturnValue(false), // Use in-memory for tests
    addSubscription: jest.fn(),
    removeSubscription: jest.fn(),
    removeAllSubscriptions: jest.fn(),
    getSubscriptions: jest.fn(),
    getAllClientIds: jest.fn(),
    getSubscriptionsByUserId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: RedisSubscriptionStore,
          useValue: mockRedisStore,
        },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clear all subscriptions after each test
    service['subscriptions'].clear();
  });

  describe('subscribe', () => {
    it('should add a subscription for a client', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');

      const subs = service['subscriptions'].get('client-1');
      expect(subs).toBeDefined();
      expect(subs).toHaveLength(1);
      expect(subs![0].entity).toBe('users');
      expect(subs![0].userId).toBe('user-1');
      expect(subs![0].role).toBe(Role.MANAGER);
      expect(subs![0].tenantId).toBe('tenant-a');
    });

    it('should allow multiple subscriptions for the same client', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'pcr_records');

      const subs = service['subscriptions'].get('client-1');
      expect(subs).toHaveLength(2);
      expect(subs![0].entity).toBe('users');
      expect(subs![1].entity).toBe('pcr_records');
    });

    it('should handle multiple clients subscribing to same entity', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-2', 'user-2', Role.MANAGER, 'tenant-a', 'users');

      expect(service['subscriptions'].get('client-1')).toHaveLength(1);
      expect(service['subscriptions'].get('client-2')).toHaveLength(1);
    });
  });

  describe('unsubscribe', () => {
    it('should remove specific subscription for a client', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'pcr_records');

      await service.unsubscribe('client-1', 'users');

      const subs = service['subscriptions'].get('client-1');
      expect(subs).toHaveLength(1);
      expect(subs![0].entity).toBe('pcr_records');
    });

    it('should handle unsubscribing from non-existent entity', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.unsubscribe('client-1', 'pcr_records');

      const subs = service['subscriptions'].get('client-1');
      expect(subs).toHaveLength(1);
    });
  });

  describe('unsubscribeAll', () => {
    it('should remove all subscriptions for a client', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'pcr_records');

      await service.unsubscribeAll('client-1');

      expect(service['subscriptions'].has('client-1')).toBe(false);
    });

    it('should not affect other clients when unsubscribing all', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-2', 'user-2', Role.MANAGER, 'tenant-a', 'users');

      await service.unsubscribeAll('client-1');

      expect(service['subscriptions'].has('client-1')).toBe(false);
      expect(service['subscriptions'].has('client-2')).toBe(true);
    });
  });

  describe('getSubscribersForEvent', () => {
    it('should return clients subscribed to the event entity', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-2', 'user-2', Role.MANAGER, 'tenant-a', 'users');

      const event: WalEvent = {
        table: 'users',
        operation: WalOperation.INSERT,
        primaryKey: 'new-user-id',
        tenantId: 'tenant-a',
        lsn: '0/12345',
        timestamp: new Date(),
        payload: {
          new: { id: 'new-user-id', name: 'Test User' },
          old: null,
        },
      };

      const subscribers = await service.getSubscribersForEvent(event);
      expect(subscribers).toContain('client-1');
      expect(subscribers).toContain('client-2');
    });

    it('should filter by tenant for non-admin users', async () => {
      await service.subscribe('client-1', 'manager-a', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-2', 'manager-b', Role.MANAGER, 'tenant-b', 'users');

      const event: WalEvent = {
        table: 'users',
        operation: WalOperation.INSERT,
        primaryKey: 'new-user-id',
        tenantId: 'tenant-a',
        lsn: '0/12345',
        timestamp: new Date(),
        payload: {
          new: { id: 'new-user-id', name: 'Test User' },
          old: null,
        },
      };

      const subscribers = await service.getSubscribersForEvent(event);
      expect(subscribers).toContain('client-1');
      expect(subscribers).not.toContain('client-2');
    });

    it('should allow admin to receive events from all tenants', async () => {
      await service.subscribe('client-admin', 'admin', Role.ADMIN, 'tenant-a', 'users');
      await service.subscribe('client-manager', 'manager-b', Role.MANAGER, 'tenant-b', 'users');

      const eventFromTenantB: WalEvent = {
        table: 'users',
        operation: WalOperation.INSERT,
        primaryKey: 'new-user-id',
        tenantId: 'tenant-b',
        lsn: '0/12345',
        timestamp: new Date(),
        payload: {
          new: { id: 'new-user-id', name: 'Test User' },
          old: null,
        },
      };

      const subscribers = await service.getSubscribersForEvent(eventFromTenantB);
      expect(subscribers).toContain('client-admin'); // Admin can see all
      expect(subscribers).toContain('client-manager'); // Manager can see their own
    });

    it('should not return subscribers for different entity', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');

      const pcrEvent: WalEvent = {
        table: 'pcr_records',
        operation: WalOperation.INSERT,
        primaryKey: 'new-pcr-id',
        tenantId: 'tenant-a',
        lsn: '0/12345',
        timestamp: new Date(),
        payload: {
          new: { id: 'new-pcr-id', title: 'Test PCR' },
          old: null,
        },
      };

      const subscribers = await service.getSubscribersForEvent(pcrEvent);
      expect(subscribers).not.toContain('client-1');
    });
  });

  describe('invalidateByUser', () => {
    it('should remove all subscriptions for a specific user', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-2', 'user-2', Role.MANAGER, 'tenant-a', 'users');

      const invalidatedClients = await service.invalidateByUser('user-1');

      expect(invalidatedClients).toContain('client-1');
      expect(invalidatedClients).not.toContain('client-2');
      expect(service['subscriptions'].has('client-1')).toBe(false);
      expect(service['subscriptions'].has('client-2')).toBe(true);
    });

    it('should handle user with multiple subscriptions', async () => {
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'users');
      await service.subscribe('client-1', 'user-1', Role.MANAGER, 'tenant-a', 'pcr_records');

      const invalidatedClients = await service.invalidateByUser('user-1');

      expect(invalidatedClients).toContain('client-1');
      expect(service['subscriptions'].has('client-1')).toBe(false);
    });

    it('should return empty array if user has no subscriptions', async () => {
      const invalidatedClients = await service.invalidateByUser('non-existent-user');
      expect(invalidatedClients).toEqual([]);
    });
  });

  describe('Security Boundary Tests', () => {
    it('should enforce tenant isolation', async () => {
      await service.subscribe('client-a', 'manager-a', Role.MANAGER, 'tenant-a', 'pcr_records');
      await service.subscribe('client-b', 'manager-b', Role.MANAGER, 'tenant-b', 'pcr_records');

      const sensitiveEventFromTenantB: WalEvent = {
        table: 'pcr_records',
        operation: WalOperation.INSERT,
        primaryKey: 'sensitive-pcr-id',
        tenantId: 'tenant-b',
        lsn: '0/12345',
        timestamp: new Date(),
        payload: {
          new: { id: 'sensitive-pcr-id', title: 'Confidential Medical Record' },
          old: null,
        },
      };

      const subscribers = await service.getSubscribersForEvent(sensitiveEventFromTenantB);

      // Manager A should NOT receive events from Tenant B
      expect(subscribers).not.toContain('client-a');
      expect(subscribers).toContain('client-b');
    });

    it('should handle role changes with invalidation', async () => {
      await service.subscribe('client-1', 'user-changing-role', Role.MANAGER, 'tenant-a', 'users');

      // Simulate role change by invalidating user
      const invalidatedClients = await service.invalidateByUser('user-changing-role');

      expect(invalidatedClients).toContain('client-1');
      expect(service['subscriptions'].has('client-1')).toBe(false);
    });

    it('should prevent memory leaks from abandoned connections', async () => {
      // Simulate 100 clients subscribing
      for (let i = 0; i < 100; i++) {
        await service.subscribe(`client-${i}`, 'user-1', Role.MANAGER, 'tenant-a', 'users');
      }

      expect(service['subscriptions'].size).toBe(100);

      // Simulate disconnections
      for (let i = 0; i < 100; i++) {
        await service.unsubscribeAll(`client-${i}`);
      }

      expect(service['subscriptions'].size).toBe(0);
    });
  });
});
