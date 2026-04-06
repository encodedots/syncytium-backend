import { Module } from '@nestjs/common';
import { WalBridgeService } from './wal-bridge.service';
import { SubscriptionService } from './subscription.service';
import { RedisSubscriptionStore } from './redis-subscription.store';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Realtime Module
 *
 * Handles real-time data synchronization via PostgreSQL WAL replication
 * and Socket.IO broadcasting.
 *
 * Components:
 * - WalBridgeService: Connects to PostgreSQL WAL stream
 * - SubscriptionService: Manages client subscriptions
 * - RealtimeGateway: Socket.IO WebSocket gateway
 * - RealtimeService: Routes events with RBAC filtering
 *
 * Flow:
 * PostgreSQL WAL → WalBridgeService → RealtimeService → RealtimeGateway → Clients
 */
@Module({
  imports: [AuthModule], // Need AuthService for JWT verification
  providers: [
    WalBridgeService,
    SubscriptionService,
    RedisSubscriptionStore,
    RealtimeGateway,
    RealtimeService,
  ],
  exports: [
    WalBridgeService,
    SubscriptionService,
    RealtimeService,
  ],
})
export class RealtimeModule {}
