import { Injectable, Logger } from '@nestjs/common';
import { Subscription, SubscriptionInvalidation } from './types/subscription.interface';
import { WalEvent, WalTable } from './types/wal-event.interface';
import { Role } from '../rbac/enums/roles.enum';
import { RedisSubscriptionStore } from './redis-subscription.store';

/**
 * Subscription Service
 *
 * CRITICAL: This is a security boundary. It manages which clients receive
 * which events based on their subscriptions and RBAC permissions.
 *
 * Supports both in-memory (development) and Redis (production) storage.
 * Automatically uses Redis when available, falls back to in-memory otherwise.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  /**
   * In-memory subscription registry (fallback when Redis unavailable)
   * Key: clientId, Value: array of subscriptions
   */
  private subscriptions = new Map<string, Subscription[]>();

  constructor(private redisStore: RedisSubscriptionStore) {
    if (this.redisStore.isAvailable()) {
      this.logger.log('Using Redis for subscription storage');
    } else {
      this.logger.warn('Redis unavailable, using in-memory subscription storage');
    }
  }

  /**
   * Subscribe a client to an entity
   *
   * @param clientId - Socket.IO client ID
   * @param userId - User ID from JWT
   * @param role - User role for RBAC
   * @param tenantId - User's tenant ID
   * @param entity - Entity to subscribe to
   * @param filters - Optional filters (future use)
   */
  async subscribe(
    clientId: string,
    userId: string,
    role: Role,
    tenantId: string | null,
    entity: WalTable,
    filters?: Record<string, any>,
  ): Promise<void> {
    const newSub: Subscription = {
      clientId,
      userId,
      role,
      tenantId,
      entity,
      filters,
      subscribedAt: new Date(),
    };

    // Use Redis if available, otherwise in-memory
    if (this.redisStore.isAvailable()) {
      try {
        await this.redisStore.addSubscription(clientId, newSub);
        this.logger.log(
          `[Redis] Client ${clientId} (user: ${userId}, role: ${role}) subscribed to ${entity}`,
        );
        return;
      } catch (error) {
        this.logger.error('Redis subscribe failed, falling back to in-memory:', error);
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    const clientSubs = this.subscriptions.get(clientId) || [];
    const existingSub = clientSubs.find((sub) => sub.entity === entity);

    if (existingSub) {
      existingSub.filters = filters;
      existingSub.subscribedAt = new Date();
    } else {
      clientSubs.push(newSub);
      this.logger.log(
        `[Memory] Client ${clientId} (user: ${userId}, role: ${role}) subscribed to ${entity}`,
      );
    }

    this.subscriptions.set(clientId, clientSubs);
  }

  /**
   * Unsubscribe a client from an entity
   *
   * @param clientId - Socket.IO client ID
   * @param entity - Entity to unsubscribe from
   */
  async unsubscribe(clientId: string, entity: WalTable): Promise<void> {
    // Use Redis if available
    if (this.redisStore.isAvailable()) {
      try {
        await this.redisStore.removeSubscription(clientId, entity);
        this.logger.log(`[Redis] Client ${clientId} unsubscribed from ${entity}`);
        return;
      } catch (error) {
        this.logger.error('Redis unsubscribe failed, falling back to in-memory:', error);
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    const clientSubs = this.subscriptions.get(clientId);
    if (!clientSubs) return;

    const filteredSubs = clientSubs.filter((sub) => sub.entity !== entity);

    if (filteredSubs.length === 0) {
      this.subscriptions.delete(clientId);
      this.logger.log(`[Memory] Client ${clientId} has no more subscriptions`);
    } else {
      this.subscriptions.set(clientId, filteredSubs);
      this.logger.log(`[Memory] Client ${clientId} unsubscribed from ${entity}`);
    }
  }

  /**
   * Unsubscribe a client from all entities
   * Called when client disconnects
   *
   * @param clientId - Socket.IO client ID
   */
  async unsubscribeAll(clientId: string): Promise<void> {
    // Use Redis if available
    if (this.redisStore.isAvailable()) {
      try {
        await this.redisStore.removeAllSubscriptions(clientId);
        this.logger.log(`[Redis] Client ${clientId} disconnected, all subscriptions removed`);
        return;
      } catch (error) {
        this.logger.error('Redis unsubscribeAll failed, falling back to in-memory:', error);
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    const clientSubs = this.subscriptions.get(clientId);
    if (clientSubs && clientSubs.length > 0) {
      this.logger.log(
        `[Memory] Client ${clientId} disconnected, removing ${clientSubs.length} subscriptions`,
      );
    }
    this.subscriptions.delete(clientId);
  }

  /**
   * Get all subscriptions for a client
   *
   * @param clientId - Socket.IO client ID
   * @returns Array of subscriptions
   */
  async getClientSubscriptions(clientId: string): Promise<Subscription[]> {
    // Use Redis if available
    if (this.redisStore.isAvailable()) {
      try {
        return await this.redisStore.getSubscriptions(clientId);
      } catch (error) {
        this.logger.error('Redis getClientSubscriptions failed:', error);
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    return this.subscriptions.get(clientId) || [];
  }

  /**
   * Get all client IDs that should receive this WAL event
   *
   * CRITICAL: This is where RBAC filtering happens for real-time events
   *
   * @param event - WAL event to filter subscribers for
   * @returns Array of client IDs that should receive the event
   */
  async getSubscribersForEvent(event: WalEvent): Promise<string[]> {
    const matchingClients: string[] = [];

    // Extract old tenant_id for UPDATE events (tenant changes)
    const oldTenantId = event.payload.old?.tenant_id || event.payload.old?.tenantId;
    const newTenantId = event.tenantId;

    // Use Redis if available
    if (this.redisStore.isAvailable()) {
      try {
        const clientIds = await this.redisStore.getAllClientIds();

        for (const clientId of clientIds) {
          const subs = await this.redisStore.getSubscriptions(clientId);
          const relevantSub = subs.find((sub) => sub.entity === event.table);

          if (!relevantSub) continue;

          // RBAC Check: Tenant access
          if (relevantSub.role !== Role.ADMIN) {
            // For UPDATE events with tenant changes, send to BOTH old and new tenant
            const hasAccessToNew = relevantSub.tenantId === newTenantId;
            const hasAccessToOld = oldTenantId && relevantSub.tenantId === oldTenantId;

            if (!hasAccessToNew && !hasAccessToOld) continue;
          }

          matchingClients.push(clientId);
        }

        return matchingClients;
      } catch (error) {
        this.logger.error('Redis getSubscribersForEvent failed, falling back to in-memory:', error);
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    for (const [clientId, subs] of this.subscriptions.entries()) {
      const relevantSub = subs.find((sub) => sub.entity === event.table);
      if (!relevantSub) continue;

      if (relevantSub.role !== Role.ADMIN) {
        // For UPDATE events with tenant changes, send to BOTH old and new tenant
        const hasAccessToNew = relevantSub.tenantId === newTenantId;
        const hasAccessToOld = oldTenantId && relevantSub.tenantId === oldTenantId;

        if (!hasAccessToNew && !hasAccessToOld) continue;
      }

      matchingClients.push(clientId);
    }

    return matchingClients;
  }

  /**
   * Invalidate all subscriptions for a specific user
   * Called when user's permissions change (role, tenant, etc.)
   *
   * Returns list of client IDs that were invalidated
   *
   * @param userId - User ID whose subscriptions should be invalidated
   * @returns Array of client IDs that were affected
   */
  async invalidateByUser(userId: string): Promise<string[]> {
    const affectedClients: string[] = [];

    // Use Redis if available
    if (this.redisStore.isAvailable()) {
      try {
        const userSubscriptions = await this.redisStore.getSubscriptionsByUserId(userId);

        for (const { clientId, subscriptions } of userSubscriptions) {
          // Remove all subscriptions for this user
          for (const sub of subscriptions) {
            await this.redisStore.removeSubscription(clientId, sub.entity);
          }
          affectedClients.push(clientId);
          this.logger.log(
            `[Redis] Invalidated ${subscriptions.length} subscriptions for user ${userId} on client ${clientId}`,
          );
        }

        return affectedClients;
      } catch (error) {
        this.logger.error('Redis invalidateByUser failed, falling back to in-memory:', error);
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    for (const [clientId, subs] of this.subscriptions.entries()) {
      const userSubs = subs.filter((sub) => sub.userId === userId);

      if (userSubs.length > 0) {
        const remainingSubs = subs.filter((sub) => sub.userId !== userId);

        if (remainingSubs.length === 0) {
          this.subscriptions.delete(clientId);
        } else {
          this.subscriptions.set(clientId, remainingSubs);
        }

        affectedClients.push(clientId);
        this.logger.log(
          `[Memory] Invalidated ${userSubs.length} subscriptions for user ${userId} on client ${clientId}`,
        );
      }
    }

    return affectedClients;
  }

  /**
   * Get total number of active subscriptions
   * Useful for monitoring/debugging
   */
  getTotalSubscriptions(): number {
    let total = 0;
    for (const subs of this.subscriptions.values()) {
      total += subs.length;
    }
    return total;
  }

  /**
   * Get number of connected clients
   */
  getConnectedClients(): number {
    return this.subscriptions.size;
  }

  /**
   * Get subscription stats (for debugging/monitoring)
   */
  getStats(): {
    connectedClients: number;
    totalSubscriptions: number;
    subscriptionsByEntity: Record<string, number>;
  } {
    const stats = {
      connectedClients: this.subscriptions.size,
      totalSubscriptions: 0,
      subscriptionsByEntity: {} as Record<string, number>,
    };

    for (const subs of this.subscriptions.values()) {
      stats.totalSubscriptions += subs.length;

      for (const sub of subs) {
        stats.subscriptionsByEntity[sub.entity] =
          (stats.subscriptionsByEntity[sub.entity] || 0) + 1;
      }
    }

    return stats;
  }
}
