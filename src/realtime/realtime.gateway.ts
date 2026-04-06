import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { SubscriptionService } from './subscription.service';
import {
  SubscribeRequest,
  SubscribeResponse,
  UnsubscribeRequest,
  SubscriptionInvalidation,
} from './types/subscription.interface';
import { UserContext } from '../auth/types/user-context.interface';

/**
 * Realtime Gateway
 *
 * WebSocket gateway for real-time event delivery via Socket.IO
 *
 * CRITICAL: This is the entry point for all WebSocket connections.
 * All connections must be authenticated via JWT cookie.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (origin, callback) => {
      // Allow requests from configured frontend URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      if (!origin || origin === frontendUrl) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'), false);
      }
    },
    credentials: true, // CRITICAL: Allow cookies
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    private configService: ConfigService,
  ) {}

  /**
   * Handle new client connection
   *
   * CRITICAL: Authenticate client via JWT cookie before allowing connection
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      // Extract JWT from cookie
      const token = this.extractTokenFromCookie(client);

      if (!token) {
        this.logger.warn(`Client ${client.id} attempted connection without token`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const auth0Payload = await this.authService.verifyToken(token);

      // Get user from database (no JIT provisioning - user must exist)
      const user = await this.authService.getUserByAuth0Id(auth0Payload.sub);

      if (!user) {
        throw new UnauthorizedException(
          'User not found. Please complete the login flow first.',
        );
      }

      // Attach user context to socket data
      client.data.user = user;

      this.logger.log(
        `Client ${client.id} connected (user: ${user.email}, role: ${user.role}, tenant: ${user.tenantId})`,
      );

      // Emit connection success
      client.emit('connected', {
        success: true,
        userId: user.id,
        message: 'Connected to realtime server',
      });
    } catch (error: any) {
      this.logger.error(
        `Authentication failed for client ${client.id}: ${error.message}`,
      );
      client.emit('error', {
        message: 'Authentication failed',
        code: 'AUTH_FAILED',
      });
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   * Clean up all subscriptions for this client
   */
  async handleDisconnect(client: Socket): Promise<void> {
    const user = client.data.user as UserContext | undefined;

    if (user) {
      this.logger.log(
        `Client ${client.id} disconnected (user: ${user.email})`,
      );
    } else {
      this.logger.log(`Client ${client.id} disconnected (unauthenticated)`);
    }

    // Clean up all subscriptions for this client
    await this.subscriptionService.unsubscribeAll(client.id);
  }

  /**
   * Handle subscribe request from client
   *
   * Client wants to receive real-time updates for a specific entity
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SubscribeRequest,
  ): Promise<SubscribeResponse> {
    const user = client.data.user as UserContext;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    try {
      // Validate entity
      if (!data.entity || !['users', 'pcr_records'].includes(data.entity)) {
        return {
          success: false,
          entity: data.entity,
          message: `Invalid entity: ${data.entity}`,
        };
      }

      // Subscribe client
      await this.subscriptionService.subscribe(
        client.id,
        user.id,
        user.role,
        user.tenantId,
        data.entity,
        data.filters,
      );

      this.logger.log(
        `Client ${client.id} (user: ${user.email}) subscribed to ${data.entity}`,
      );

      return {
        success: true,
        entity: data.entity,
        message: `Subscribed to ${data.entity}`,
      };
    } catch (error: any) {
      this.logger.error(
        `Subscribe failed for client ${client.id}: ${error.message}`,
      );

      return {
        success: false,
        entity: data.entity,
        message: `Subscribe failed: ${error.message}`,
      };
    }
  }

  /**
   * Handle unsubscribe request from client
   *
   * Client no longer wants updates for a specific entity
   */
  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UnsubscribeRequest,
  ): Promise<SubscribeResponse> {
    const user = client.data.user as UserContext;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    try {
      await this.subscriptionService.unsubscribe(client.id, data.entity);

      this.logger.log(
        `Client ${client.id} (user: ${user.email}) unsubscribed from ${data.entity}`,
      );

      return {
        success: true,
        entity: data.entity,
        message: `Unsubscribed from ${data.entity}`,
      };
    } catch (error: any) {
      this.logger.error(
        `Unsubscribe failed for client ${client.id}: ${error.message}`,
      );

      return {
        success: false,
        entity: data.entity,
        message: `Unsubscribe failed: ${error.message}`,
      };
    }
  }

  /**
   * Send subscription invalidation to specific client
   *
   * Called when user's permissions change (role, tenant, etc.)
   */
  sendInvalidation(clientId: string, invalidation: SubscriptionInvalidation): void {
    const client = this.server.sockets.sockets.get(clientId);

    if (client) {
      this.logger.log(
        `Sending subscription invalidation to client ${clientId}: ${invalidation.reason}`,
      );

      client.emit('subscription:invalidated', invalidation);
    }
  }

  /**
   * Emit event to specific client
   *
   * Used by RealtimeService to broadcast WAL events
   */
  emitToClient(clientId: string, event: string, data: any): void {
    if (!this.server) {
      this.logger.warn(`Cannot emit to client ${clientId}: server not initialized`);
      return;
    }

    // Use Socket.IO's to() method to emit to a specific socket
    // This works with namespaces and handles disconnected clients gracefully
    this.server.to(clientId).emit(event, data);
  }

  /**
   * Extract JWT token from Socket.IO handshake cookies
   *
   * CRITICAL: Token must come from HTTP-only cookie, not query params
   */
  private extractTokenFromCookie(client: Socket): string | undefined {
    try {
      // Socket.IO passes cookies in handshake.headers.cookie
      const cookieHeader = client.handshake.headers.cookie;

      if (!cookieHeader) {
        return undefined;
      }

      // Parse cookie header
      const cookies = this.parseCookies(cookieHeader);

      return cookies['access_token'];
    } catch (error: any) {
      this.logger.error(`Error extracting token from cookie: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Parse cookie header string into key-value object
   */
  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    cookieHeader.split(';').forEach((cookie) => {
      const [name, ...rest] = cookie.split('=');
      cookies[name.trim()] = rest.join('=').trim();
    });

    return cookies;
  }

  /**
   * Get subscription statistics (for debugging/monitoring)
   */
  @SubscribeMessage('stats')
  getStats(): any {
    return this.subscriptionService.getStats();
  }
}
