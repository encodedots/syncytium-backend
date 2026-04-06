import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WalBridgeService } from './wal-bridge.service';
import { SubscriptionService } from './subscription.service';
import { RealtimeGateway } from './realtime.gateway';
import { RbacService } from '../rbac/rbac.service';
import { WalEvent } from './types/wal-event.interface';
import { SubscriptionInvalidation } from './types/subscription.interface';

/**
 * Realtime Service
 *
 * Central hub for real-time event routing.
 *
 * Connects:
 * - WalBridgeService (PostgreSQL WAL) → decodes database changes
 * - RbacService → filters events by permissions
 * - SubscriptionService → finds subscribed clients
 * - RealtimeGateway (Socket.IO) → broadcasts to clients
 *
 * CRITICAL: This is where RBAC filtering is applied to real-time events
 */
@Injectable()
export class RealtimeService implements OnModuleInit {
  private readonly logger = new Logger(RealtimeService.name);

  // Event batching for performance
  private eventBatchBuffer: Map<string, Array<{ eventName: string; data: any }>> = new Map();
  private batchFlushTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_INTERVAL_MS = 100; // Flush every 100ms
  private readonly MAX_BATCH_SIZE = 50; // Flush if batch reaches 50 events

  constructor(
    private walBridgeService: WalBridgeService,
    private subscriptionService: SubscriptionService,
    private rbacService: RbacService,
    private gateway: RealtimeGateway,
  ) {}

  /**
   * Initialize service and connect WAL bridge to event handler
   */
  onModuleInit() {
    this.logger.log('Initializing Realtime Service...');

    // Connect WAL bridge to our event handler
    this.walBridgeService.setEventHandler(async (event: WalEvent) => {
      await this.handleWalEvent(event);
    });

    this.logger.log('WAL bridge connected to realtime event handler');
  }

  /**
   * Handle WAL event from database
   *
   * This is called for every INSERT/UPDATE/DELETE in the database
   *
   * Flow:
   * 1. Get list of subscribed clients for this event
   * 2. For each client:
   *    a. Check RBAC permissions
   *    b. Filter fields based on role
   *    c. Emit event via Socket.IO
   */
  private async handleWalEvent(event: WalEvent): Promise<void> {
    try {
      this.logger.log(
        `🔄 Processing WAL event: ${event.operation} on ${event.table} (tenant: ${event.tenantId}, PK: ${event.primaryKey})`,
      );

      // Phase 7: Detect role changes and trigger subscription invalidation
      await this.detectAndHandleRoleChange(event);

      // Get all clients subscribed to this entity
      const subscriberIds = await this.subscriptionService.getSubscribersForEvent(event);

      if (subscriberIds.length === 0) {
        this.logger.warn(`⚠️ No subscribers for ${event.table} event, skipping`);
        return;
      }

      this.logger.log(
        `📡 Broadcasting ${event.operation} on ${event.table} to ${subscriberIds.length} subscribers`,
      );

      // Broadcast to each subscriber
      for (const clientId of subscriberIds) {
        await this.broadcastToClient(clientId, event);
      }
    } catch (error: any) {
      this.logger.error(`Error handling WAL event: ${error.message}`, error.stack);
    }
  }

  /**
   * Detect role changes in WAL events and trigger subscription invalidation
   *
   * Phase 7: Automatic RBAC subscription invalidation
   *
   * When a user's role changes, their subscriptions are invalidated
   * to prevent them from receiving events they're no longer authorized to see.
   */
  private async detectAndHandleRoleChange(event: WalEvent): Promise<void> {
    // Only check UPDATE events on users table
    if (event.table !== 'users' || event.operation !== 'UPDATE') {
      return;
    }

    // Check if role changed
    const oldRole = event.payload.old?.role;
    const newRole = event.payload.new?.role;

    if (!oldRole || !newRole || oldRole === newRole) {
      return; // No role change
    }

    // Role changed! Trigger subscription invalidation
    const userId = event.primaryKey;

    this.logger.log(
      `Role change detected for user ${userId}: ${oldRole} → ${newRole}`,
    );

    // Invalidate all subscriptions for this user
    await this.invalidateUserSubscriptions(userId, 'role_changed');
  }

  /**
   * Broadcast event to a specific client
   *
   * Applies RBAC filtering before sending
   */
  private async broadcastToClient(clientId: string, event: WalEvent): Promise<void> {
    try {
      // Get client subscriptions to retrieve user context
      const subscriptions = await this.subscriptionService.getClientSubscriptions(clientId);

      if (subscriptions.length === 0) {
        return; // No subscriptions, skip
      }

      // Get user context from first subscription (all have same user)
      const subscription = subscriptions[0];
      const userContext = {
        id: subscription.userId,
        role: subscription.role,
        tenantId: subscription.tenantId,
        email: '', // Not needed for filtering
        name: '', // Not needed for filtering
        auth0Id: '', // Not needed for filtering
      };

      // RBAC Check: Can user access this tenant?
      // For UPDATE operations, check BOTH old and new tenants (for tenant changes)
      // For INSERT/DELETE, check the event's tenant
      let canAccess = false;

      if (event.operation === 'UPDATE') {
        const newTenantId = event.payload.new?.tenant_id || event.payload.new?.tenantId;
        const oldTenantId = event.payload.old?.tenant_id || event.payload.old?.tenantId;

        // Manager should receive event if user was in their tenant OR is now in their tenant
        canAccess =
          this.rbacService.canAccessTenant(userContext, newTenantId || event.tenantId) ||
          (oldTenantId && this.rbacService.canAccessTenant(userContext, oldTenantId));
      } else {
        // For INSERT/DELETE, check the event's tenant
        canAccess = this.rbacService.canAccessTenant(userContext, event.tenantId);
      }

      if (!canAccess) {
        this.logger.debug(
          `Client ${clientId} denied access to ${event.table} record (RBAC)`,
        );
        return;
      }

      // Filter fields based on role
      let filteredPayload = { ...event.payload };

      if (filteredPayload.new) {
        filteredPayload.new = this.rbacService.filterFieldsByRole(
          userContext,
          filteredPayload.new,
        );
      }

      if (filteredPayload.old) {
        filteredPayload.old = this.rbacService.filterFieldsByRole(
          userContext,
          filteredPayload.old,
        );
      }

      // Construct event name: e.g., "users:INSERT", "pcr_records:UPDATE"
      const eventName = `${event.table}:${event.operation}`;

      // Add to batch buffer instead of immediate emission
      this.addToBatch(clientId, eventName, {
        ...event,
        payload: filteredPayload,
      });

      this.logger.log(
        `✅ Batched ${eventName} for client ${clientId} (user: ${subscription.userId})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error broadcasting to client ${clientId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Add event to batch buffer for a client
   *
   * Events are buffered and sent in batches to reduce Socket.IO overhead
   */
  private addToBatch(clientId: string, eventName: string, data: any): void {
    // Get or create batch buffer for this client
    if (!this.eventBatchBuffer.has(clientId)) {
      this.eventBatchBuffer.set(clientId, []);
    }

    const batch = this.eventBatchBuffer.get(clientId)!;
    batch.push({ eventName, data });

    // If batch is full, flush immediately
    if (batch.length >= this.MAX_BATCH_SIZE) {
      this.flushBatch(clientId);
      return;
    }

    // Schedule batch flush if not already scheduled
    if (!this.batchFlushTimers.has(clientId)) {
      const timer = setTimeout(() => {
        this.flushBatch(clientId);
      }, this.BATCH_INTERVAL_MS);

      this.batchFlushTimers.set(clientId, timer);
    }
  }

  /**
   * Flush batch of events to client
   *
   * Sends all buffered events at once to reduce network overhead
   */
  private flushBatch(clientId: string): void {
    const batch = this.eventBatchBuffer.get(clientId);

    if (!batch || batch.length === 0) {
      return;
    }

    // Clear timer
    const timer = this.batchFlushTimers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.batchFlushTimers.delete(clientId);
    }

    // Send batched events
    if (batch.length === 1) {
      // Single event, send directly (no batching overhead)
      const { eventName, data } = batch[0];
      this.gateway.emitToClient(clientId, eventName, data);
      this.logger.log(`📤 Emitted single event "${eventName}" to client ${clientId}`);
    } else {
      // Multiple events, send as batch
      this.gateway.emitToClient(clientId, 'events:batch', { events: batch });
      this.logger.log(`📤 Emitted batch of ${batch.length} events to client ${clientId}`);
    }

    // Clear buffer
    this.eventBatchBuffer.set(clientId, []);
  }

  /**
   * Invalidate subscriptions for a user
   *
   * Called when user's permissions change (role, tenant, etc.)
   * Forces client to re-subscribe with updated permissions
   */
  async invalidateUserSubscriptions(
    userId: string,
    reason: SubscriptionInvalidation['reason'],
  ): Promise<void> {
    this.logger.log(`Invalidating subscriptions for user ${userId}: ${reason}`);

    // Get affected clients
    const affectedClients = await this.subscriptionService.invalidateByUser(userId);

    if (affectedClients.length === 0) {
      this.logger.debug(`No active subscriptions found for user ${userId}`);
      return;
    }

    // Send invalidation event to each client
    const invalidation: SubscriptionInvalidation = {
      reason,
      message: 'Your permissions have changed. Please refresh and re-subscribe.',
      timestamp: new Date(),
    };

    for (const clientId of affectedClients) {
      this.gateway.sendInvalidation(clientId, invalidation);
    }

    this.logger.log(
      `Invalidated subscriptions for ${affectedClients.length} clients of user ${userId}`,
    );
  }

  /**
   * Get realtime statistics
   */
  getStats(): {
    walActive: boolean;
    currentLsn: string;
    subscriptions: ReturnType<SubscriptionService['getStats']>;
  } {
    return {
      walActive: this.walBridgeService.isStreamActive(),
      currentLsn: this.walBridgeService.getCurrentLsn(),
      subscriptions: this.subscriptionService.getStats(),
    };
  }
}
