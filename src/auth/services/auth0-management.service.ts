import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ManagementClient } from 'auth0';

/**
 * Auth0 Management API Service
 *
 * Handles programmatic user management in Auth0:
 * - Create users
 * - Update users
 * - Delete users
 * - Link Auth0 users to database users
 */
@Injectable()
export class Auth0ManagementService {
  private readonly logger = new Logger(Auth0ManagementService.name);
  private managementClient: ManagementClient;
  private readonly defaultPassword = 'Admin@123'; // Can be configurable

  constructor(private configService: ConfigService) {
    const domain = this.configService.get<string>('auth0.domain');
    const clientId = this.configService.get<string>('auth0.m2mClientId');
    const clientSecret = this.configService.get<string>('auth0.m2mClientSecret');

    this.managementClient = new ManagementClient({
      domain: domain!,
      clientId: clientId!,
      clientSecret: clientSecret!,
    });

    this.logger.log('Auth0 Management API initialized with M2M credentials');
  }

  /**
   * Create a user in Auth0
   */
  async createUser(email: string, name: string, password?: string): Promise<string> {
    try {
      this.logger.log(`Creating Auth0 user: ${email}`);

      const response = await this.managementClient.users.create({
        email,
        name,
        password: password || this.defaultPassword,
        connection: 'Username-Password-Authentication', // Default Auth0 database connection
        email_verified: true, // Auto-verify for admin-created users
      });

      // Handle different response structures
      const userId = response.data?.user_id || response.user_id;

      if (!userId) {
        this.logger.error('Auth0 response structure:', JSON.stringify(response));
        throw new Error('No user_id in Auth0 response');
      }

      this.logger.log(`✅ Auth0 user created: ${email} (ID: ${userId})`);
      return userId;
    } catch (error: any) {
      this.logger.error(`Failed to create Auth0 user ${email}:`, error.message);

      // If user already exists in Auth0, try to find and return their ID
      if (error.statusCode === 409) {
        this.logger.log(`User ${email} already exists in Auth0, fetching ID...`);
        const existingUser = await this.getUserByEmail(email);
        if (existingUser) {
          return existingUser.user_id!;
        }
      }

      throw error;
    }
  }

  /**
   * Get user by email from Auth0
   */
  async getUserByEmail(email: string): Promise<any | null> {
    try {
      // Search users by email
      const response = await this.managementClient.users.listUsersByEmail({ email });

      if (response && response.length > 0) {
        return response[0];
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Failed to get Auth0 user by email ${email}:`, error.message);
      return null;
    }
  }

  /**
   * Get user by Auth0 ID
   */
  async getUserById(auth0Id: string): Promise<any | null> {
    try {
      const response = await this.managementClient.users.get(auth0Id);
      return response.data || response;
    } catch (error: any) {
      this.logger.error(`Failed to get Auth0 user by ID ${auth0Id}:`, error.message);
      return null;
    }
  }

  /**
   * Update user in Auth0
   */
  async updateUser(auth0Id: string, data: { email?: string; name?: string }): Promise<void> {
    try {
      this.logger.log(`Updating Auth0 user: ${auth0Id}`);

      await this.managementClient.users.update(auth0Id, data);

      this.logger.log(`✅ Auth0 user updated: ${auth0Id}`);
    } catch (error: any) {
      this.logger.error(`Failed to update Auth0 user ${auth0Id}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete user from Auth0
   */
  async deleteUser(auth0Id: string): Promise<void> {
    try {
      this.logger.log(`Deleting Auth0 user: ${auth0Id}`);

      await this.managementClient.users.delete(auth0Id);

      this.logger.log(`✅ Auth0 user deleted: ${auth0Id}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete Auth0 user ${auth0Id}:`, error.message);
      throw error;
    }
  }

  /**
   * Send password reset email (for invite-based flow)
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      this.logger.log(`Sending password reset email to: ${email}`);

      await this.managementClient.tickets.changePassword({
        email,
        connection_id: 'Username-Password-Authentication',
      } as any);

      this.logger.log(`✅ Password reset email sent to: ${email}`);
    } catch (error: any) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error.message);
      throw error;
    }
  }
}
