/**
 * WAL Event Types and Interfaces
 *
 * Represents structured events decoded from PostgreSQL Write-Ahead Log
 */

/**
 * Operation types from PostgreSQL logical replication
 */
export enum WalOperation {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

/**
 * Table names that are replicated
 */
export type WalTable = 'users' | 'pcr_records';

/**
 * Structured WAL event after decoding
 *
 * This is the primary data structure for real-time events
 */
export interface WalEvent {
  /** Table name where the change occurred */
  table: WalTable;

  /** Type of operation */
  operation: WalOperation;

  /** Primary key of the affected record */
  primaryKey: string;

  /** Tenant ID for multi-tenant filtering */
  tenantId: string;

  /** Log Sequence Number for tracking position */
  lsn: string;

  /** Timestamp when the event was captured */
  timestamp: Date;

  /** Event payload with old and new record data */
  payload: WalPayload;
}

/**
 * Payload containing record data
 */
export interface WalPayload {
  /** New record data (INSERT/UPDATE) */
  new: Record<string, any> | null;

  /** Old record data (UPDATE/DELETE) */
  old: Record<string, any> | null;
}

/**
 * Raw WAL message from PostgreSQL replication stream
 */
export interface RawWalMessage {
  /** Message type indicator */
  tag: string;

  /** Log Sequence Number */
  lsn: string;

  /** Raw message buffer */
  buffer: Buffer;
}

/**
 * Replication slot configuration
 */
export interface ReplicationSlotConfig {
  /** Slot name (must be unique) */
  slotName: string;

  /** Plugin name (pgoutput for logical replication) */
  pluginName: string;

  /** Publication name */
  publicationName: string;
}
