#!/usr/bin/env ts-node
/**
 * Sync Existing Database Users to Auth0
 *
 * This script:
 * 1. Reads all users from the database
 * 2. Creates them in Auth0 with password Admin@123
 * 3. Updates database with Auth0 user IDs
 *
 * Usage: npx ts-node scripts/sync-users-to-auth0.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ManagementClient } from 'auth0';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = 'Admin@123';

// Initialize Auth0 Management Client with M2M credentials
const auth0 = new ManagementClient({
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_M2M_CLIENT_ID!,
  clientSecret: process.env.AUTH0_M2M_CLIENT_SECRET!,
});

async function syncUsersToAuth0() {
  console.log('🚀 Starting user sync to Auth0...\n');

  try {
    // Get all users from database
    const users = await prisma.user.findMany({
      include: { tenant: true },
    });

    console.log(`📊 Found ${users.length} users in database\n`);

    let created = 0;
    let existing = 0;
    let updated = 0;
    let errors = 0;

    for (const user of users) {
      console.log(`\n👤 Processing: ${user.email}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Tenant: ${user.tenant?.name || 'Unknown'}`);
      console.log(`   Auth0 ID: ${user.auth0Id || 'Not linked'}`);

      try {
        // Check if user already has Auth0 ID
        if (user.auth0Id) {
          console.log(`   ✓ Already linked to Auth0`);
          existing++;
          continue;
        }

        // Check if user exists in Auth0 by email
        const searchResponse = await auth0.users.listUsersByEmail({ email: user.email });

        if (searchResponse && searchResponse.length > 0) {
          // User exists in Auth0, link the ID
          const auth0User = searchResponse[0];
          console.log(`   ✓ Found existing Auth0 user: ${auth0User.user_id}`);

          await prisma.user.update({
            where: { id: user.id },
            data: { auth0Id: auth0User.user_id },
          });

          console.log(`   ✅ Linked to existing Auth0 user`);
          updated++;
          continue;
        }

        // Create new user in Auth0
        console.log(`   🆕 Creating new Auth0 user...`);
        const response = await auth0.users.create({
          email: user.email,
          name: user.name,
          password: DEFAULT_PASSWORD,
          connection: 'Username-Password-Authentication',
          email_verified: true,
        });

        const auth0Id = response.data.user_id!;
        console.log(`   ✓ Created in Auth0: ${auth0Id}`);

        // Update database with Auth0 ID
        await prisma.user.update({
          where: { id: user.id },
          data: { auth0Id },
        });

        console.log(`   ✅ Successfully synced`);
        created++;
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        if (error.response?.data) {
          console.error(`   Details: ${JSON.stringify(error.response.data)}`);
        }
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Sync Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Created in Auth0:        ${created}`);
    console.log(`🔗 Linked existing:         ${updated}`);
    console.log(`✓  Already linked:          ${existing}`);
    console.log(`❌ Errors:                  ${errors}`);
    console.log(`📋 Total processed:         ${users.length}`);
    console.log('='.repeat(60));

    if (created > 0 || updated > 0) {
      console.log('\n🔑 Default Password: Admin@123');
      console.log('⚠️  Users should change this password after first login!\n');
    }

    console.log('\n✅ Sync complete!');
  } catch (error: any) {
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the sync
syncUsersToAuth0();
