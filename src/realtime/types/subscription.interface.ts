import { Role } from '../../rbac/enums/roles.enum';
import { WalTable } from './wal-event.interface';

/**
 * Subscription Interface
 *
 * Represents a client's subscription to real-time events for a specific entity
 */
export interface Subscription {
  /** Socket.IO client ID */
  clientId: string;

  /** User ID (from JWT) */
  userId: string;

  /** User role (for RBAC filtering) */
  role: Role;

  /** Tenant ID (for tenant scoping, null for ADMIN users) */
  tenantId: string | null;

  /** Entity/table being subscribed to */
  entity: WalTable;

  /** Optional filters (future use) */
  filters?: Record<string, any>;

  /** Timestamp when subscription was created */
  subscribedAt: Date;
}

/**
 * Subscription request from client
 */
export interface SubscribeRequest {
  /** Entity/table to subscribe to */
  entity: WalTable;

  /** Optional filters */
  filters?: Record<string, any>;
}

/**
 * Subscription response to client
 */
export interface SubscribeResponse {
  /** Success status */
  success: boolean;

  /** Entity subscribed to */
  entity: WalTable;

  /** Optional message */
  message?: string;
}

/**
 * Unsubscribe request from client
 */
export interface UnsubscribeRequest {
  /** Entity/table to unsubscribe from */
  entity: WalTable;
}

/**
 * Subscription invalidation event
 */
export interface SubscriptionInvalidation {
  /** Reason for invalidation */
  reason: 'role_changed' | 'permissions_changed' | 'tenant_changed' | 'forced';

  /** Message to client */
  message: string;

  /** Timestamp */
  timestamp: Date;
}
