import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Subscription } from './types/subscription.interface';

/**
 * Redis-backed subscription storage for horizontal scalability
 * Replaces in-memory Map for production deployments
 */
@Injectable()
export class RedisSubscriptionStore implements OnModuleDestroy {
  private readonly logger = new Logger(RedisSubscriptionStore.name);
  private redis: Redis | null = null;
  private readonly ttl = 86400; // 24 hours TTL for subscriptions

  constructor(private configService: ConfigService) {
    this.initializeRedis();
  }

  private initializeRedis() {
    const redisUrl = this.configService.get<string>('redis.url');
    const redisHost = this.configService.get<string>('redis.host');
    const redisPort = this.configService.get<number>('redis.port');
    const redisPassword = this.configService.get<string>('redis.password');

    // Only initialize if Redis configuration is provided
    if (!redisUrl && !redisHost) {
      this.logger.warn(
        'Redis configuration not found. Subscription store will not be available.',
      );
      return;
    }

    try {
      if (redisUrl) {
        this.redis = new Redis(redisUrl, {
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
        });
      } else {
        this.redis = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
        });
      }

      this.redis.on('connect', () => {
        this.logger.log('Connected to Redis');
      });

      this.redis.on('error', (err: Error) => {
        this.logger.error('Redis connection error:', err);
      });

      this.redis.on('ready', () => {
        this.logger.log('Redis client ready');
      });
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
      this.redis = null;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  /**
   * Add a subscription to Redis
   * Key format: sub:{clientId}
   * Value: JSON array of subscriptions
   */
  async addSubscription(
    clientId: string,
    subscription: Subscription,
  ): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Redis is not available');
    }

    const key = `sub:${clientId}`;
    const existing = await this.getSubscriptions(clientId);
    existing.push(subscription);

    await this.redis!.setex(key, this.ttl, JSON.stringify(existing));
    this.logger.debug(`Added subscription for client ${clientId}`);
  }

  /**
   * Get all subscriptions for a client
   */
  async getSubscriptions(clientId: string): Promise<Subscription[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const key = `sub:${clientId}`;
    const data = await this.redis!.get(key);

    if (!data) {
      return [];
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      this.logger.error(`Failed to parse subscriptions for ${clientId}:`, error);
      return [];
    }
  }

  /**
   * Remove a specific subscription
   */
  async removeSubscription(clientId: string, entity: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const key = `sub:${clientId}`;
    const existing = await this.getSubscriptions(clientId);
    const updated = existing.filter((sub) => sub.entity !== entity);

    if (updated.length === 0) {
      await this.redis!.del(key);
    } else {
      await this.redis!.setex(key, this.ttl, JSON.stringify(updated));
    }

    this.logger.debug(
      `Removed subscription for entity ${entity} from client ${clientId}`,
    );
  }

  /**
   * Remove all subscriptions for a client
   */
  async removeAllSubscriptions(clientId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const key = `sub:${clientId}`;
    await this.redis!.del(key);
    this.logger.debug(`Removed all subscriptions for client ${clientId}`);
  }

  /**
   * Get all client IDs that have subscriptions
   * Uses SCAN to avoid blocking
   */
  async getAllClientIds(): Promise<string[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const clientIds: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis!.scan(
        cursor,
        'MATCH',
        'sub:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const clientId = key.replace('sub:', '');
        clientIds.push(clientId);
      }
    } while (cursor !== '0');

    return clientIds;
  }

  /**
   * Get all subscriptions for a specific user
   * Used for invalidation when user's role changes
   */
  async getSubscriptionsByUserId(userId: string): Promise<
    Array<{ clientId: string; subscriptions: Subscription[] }>
  > {
    if (!this.isAvailable()) {
      return [];
    }

    const clientIds = await this.getAllClientIds();
    const result: Array<{ clientId: string; subscriptions: Subscription[] }> =
      [];

    for (const clientId of clientIds) {
      const subscriptions = await this.getSubscriptions(clientId);
      const userSubs = subscriptions.filter((sub) => sub.userId === userId);

      if (userSubs.length > 0) {
        result.push({ clientId, subscriptions: userSubs });
      }
    }

    return result;
  }

  /**
   * Refresh TTL for a client's subscriptions
   * Called periodically to keep active subscriptions alive
   */
  async refreshTTL(clientId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const key = `sub:${clientId}`;
    const exists = await this.redis!.exists(key);

    if (exists) {
      await this.redis!.expire(key, this.ttl);
    }
  }

  /**
   * Get subscription count (for monitoring)
   */
  async getSubscriptionCount(): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    const clientIds = await this.getAllClientIds();
    return clientIds.length;
  }

  async onModuleDestroy() {
    if (this.redis) {
      this.logger.log('Disconnecting from Redis...');
      await this.redis.quit();
    }
  }
}
