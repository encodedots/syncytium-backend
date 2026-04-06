import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogicalReplicationService, PgoutputPlugin, Pgoutput } from 'pg-logical-replication';
import {
  WalEvent,
  WalOperation,
  WalTable,
  ReplicationSlotConfig,
} from './types/wal-event.interface';

/**
 * WAL Bridge Service
 *
 * CRITICAL: This service connects to PostgreSQL's logical replication stream
 * and decodes Write-Ahead Log messages into structured events.
 *
 * This is the foundation of real-time synchronization.
 * Any errors here affect all real-time features.
 */
@Injectable()
export class WalBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalBridgeService.name);
  private replicationService: LogicalReplicationService | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private readonly slotConfig: ReplicationSlotConfig = {
    slotName: 'realtime_slot',
    pluginName: 'pgoutput',
    publicationName: 'realtime_pub',
  };

  // Event handlers will be set by RealtimeService
  private eventHandler: ((event: WalEvent) => Promise<void>) | null = null;

  constructor(private configService: ConfigService) {}

  /**
   * Initialize WAL bridge on module startup
   */
  async onModuleInit() {
    this.logger.log('Initializing WAL Bridge Service...');
    await this.connect();
  }

  /**
   * Cleanup on module shutdown
   */
  async onModuleDestroy() {
    this.logger.log('Shutting down WAL Bridge Service...');
    await this.disconnect();
  }

  /**
   * Set event handler for forwarding decoded events
   */
  setEventHandler(handler: (event: WalEvent) => Promise<void>) {
    this.eventHandler = handler;
    this.logger.log('Event handler registered');
  }

  /**
   * Connect to PostgreSQL replication stream
   */
  private async connect(): Promise<void> {
    try {
      const databaseUrl = this.configService.get<string>('database.url');

      if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      // Create logical replication service
      this.replicationService = new LogicalReplicationService(
        {
          connectionString: databaseUrl,
          ssl: {
            rejectUnauthorized: false, // AWS RDS uses self-signed certificates
          },
        },
        {
          acknowledge: {
            auto: true,
            timeoutSeconds: 10,
          },
        },
      );

      // Create pgoutput plugin
      const plugin = new PgoutputPlugin({
        protoVersion: 1,
        publicationNames: [this.slotConfig.publicationName],
      });

      // Listen for WAL messages (must be set before subscribe)
      this.replicationService.on('data', async (lsn: string, log: Pgoutput.Message) => {
        await this.handleWalMessage(lsn, log);
      });

      // Listen for start event
      this.replicationService.on('start', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.logger.log('✅ Connected and subscribed to WAL replication stream');
      });

      // Listen for heartbeat/keepalive
      this.replicationService.on('heartbeat', (lsn: string) => {
        // Library automatically handles acknowledgments
        this.logger.debug(`Heartbeat received at LSN: ${lsn}`);
      });

      // Handle errors
      this.replicationService.on('error', (error: Error) => {
        this.logger.error(`Replication stream error: ${error.message}`);
        this.handleConnectionError(error);
      });

      // Subscribe to replication slot (non-blocking)
      this.replicationService.subscribe(plugin, this.slotConfig.slotName).catch((error) => {
        this.logger.error(`Failed to subscribe to replication slot: ${error.message}`);
        this.handleConnectionError(error);
      });

      this.logger.log('Subscribing to WAL replication stream...');

    } catch (error: any) {
      this.logger.error(`Failed to connect to replication stream: ${error.message}`);
      this.isConnected = false;
      await this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from replication stream
   */
  private async disconnect(): Promise<void> {
    this.isConnected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.replicationService) {
      try {
        await this.replicationService.stop();
        this.logger.log('Disconnected from replication stream');
      } catch (error: any) {
        this.logger.error(`Error disconnecting: ${error.message}`);
      }
      this.replicationService = null;
    }
  }

  /**
   * Handle WAL message from replication stream
   */
  private async handleWalMessage(lsn: string, log: Pgoutput.Message): Promise<void> {
    try {
      // The pg-logical-replication library already decodes the message
      const event = this.convertToWalEvent(lsn, log);

      if (event) {
        this.logger.log(
          `📨 WAL Event: ${event.operation} on ${event.table} (PK: ${event.primaryKey})`,
        );

        // Forward event to handler
        if (this.eventHandler) {
          await this.eventHandler(event);
        } else {
          this.logger.warn('⚠️ No event handler registered!');
        }
      }
    } catch (error: any) {
      this.logger.error(`Error handling WAL message: ${error.message}`);
    }
  }

  /**
   * Convert pg-logical-replication message to WalEvent
   */
  private convertToWalEvent(lsn: string, log: Pgoutput.Message): WalEvent | null {
    try {
      // Handle different message types
      if (log.tag === 'insert') {
        const insertLog = log as Pgoutput.MessageInsert;
        return {
          operation: WalOperation.INSERT,
          table: insertLog.relation.name as WalTable,
          primaryKey: this.extractPrimaryKey(insertLog.new),
          tenantId: insertLog.new.tenantId || insertLog.new.tenant_id || '',
          lsn,
          timestamp: new Date(),
          payload: {
            new: insertLog.new,
            old: null,
          },
        };
      }

      if (log.tag === 'update') {
        const updateLog = log as Pgoutput.MessageUpdate;
        return {
          operation: WalOperation.UPDATE,
          table: updateLog.relation.name as WalTable,
          primaryKey: this.extractPrimaryKey(updateLog.new),
          tenantId: updateLog.new.tenantId || updateLog.new.tenant_id || '',
          lsn,
          timestamp: new Date(),
          payload: {
            new: updateLog.new,
            old: updateLog.old || null,
          },
        };
      }

      if (log.tag === 'delete') {
        const deleteLog = log as Pgoutput.MessageDelete;
        const oldData = deleteLog.old || deleteLog.key;
        return {
          operation: WalOperation.DELETE,
          table: deleteLog.relation.name as WalTable,
          primaryKey: this.extractPrimaryKey(oldData),
          tenantId: oldData?.tenantId || oldData?.tenant_id || '',
          lsn,
          timestamp: new Date(),
          payload: {
            new: null,
            old: oldData,
          },
        };
      }

      // Skip other message types (begin, commit, relation, etc.)
      return null;
    } catch (error: any) {
      this.logger.error(`Error converting WAL event: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract primary key from row data
   * Assumes 'id' field is the primary key
   */
  private extractPrimaryKey(data: any): string {
    return data?.id || 'unknown';
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error): void {
    this.isConnected = false;

    this.logger.error(`Connection error: ${error.message}`);

    // Schedule reconnect
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached. Manual intervention required.');
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff: 2^attempts * 1000ms (1s, 2s, 4s, 8s, ...)
    const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 60000);

    this.logger.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.reconnect();
    }, delay);
  }

  /**
   * Attempt to reconnect
   */
  private async reconnect(): Promise<void> {
    this.logger.log('Attempting to reconnect...');

    // Disconnect existing connection
    await this.disconnect();

    // Connect again
    await this.connect();
  }

  /**
   * Get connection status
   */
  isStreamActive(): boolean {
    return this.isConnected;
  }

  /**
   * Get current LSN
   */
  getCurrentLsn(): string {
    return this.replicationService?.lastLsn() || '0/0';
  }
}
