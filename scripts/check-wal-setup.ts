import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * WAL Replication Diagnostic Script
 *
 * Checks if PostgreSQL WAL replication is properly configured
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🔍 Checking PostgreSQL WAL Replication Setup...\n');

  try {
    // Check WAL level
    console.log('1️⃣  Checking WAL level...');
    const walLevel = await prisma.$queryRaw<Array<{ wal_level: string }>>`
      SHOW wal_level;
    `;
    console.log(`   WAL Level: ${walLevel[0].wal_level}`);
    if (walLevel[0].wal_level !== 'logical') {
      console.log('   ❌ WAL level must be "logical" for replication');
      console.log('   💡 Fix: Set wal_level=logical in postgresql.conf or docker-compose.yml\n');
    } else {
      console.log('   ✅ WAL level is correctly set to logical\n');
    }

    // Check max_replication_slots
    console.log('2️⃣  Checking max_replication_slots...');
    const maxSlots = await prisma.$queryRaw<Array<{ max_replication_slots: string }>>`
      SHOW max_replication_slots;
    `;
    console.log(`   Max Replication Slots: ${maxSlots[0].max_replication_slots}`);
    if (parseInt(maxSlots[0].max_replication_slots) < 1) {
      console.log('   ❌ max_replication_slots must be at least 1');
      console.log('   💡 Fix: Set max_replication_slots=4 in postgresql.conf or docker-compose.yml\n');
    } else {
      console.log('   ✅ Replication slots are enabled\n');
    }

    // Check publication
    console.log('3️⃣  Checking publication "realtime_pub"...');
    const publications = await prisma.$queryRaw<Array<{ pubname: string }>>`
      SELECT pubname FROM pg_publication WHERE pubname = 'realtime_pub';
    `;
    if (publications.length === 0) {
      console.log('   ❌ Publication "realtime_pub" does not exist');
      console.log('   💡 Fix: Run the wal_setup.sql migration\n');
    } else {
      console.log('   ✅ Publication "realtime_pub" exists');

      // Check which tables are published
      const pubTables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_publication_tables WHERE pubname = 'realtime_pub';
      `;
      console.log(`   📋 Published tables: ${pubTables.map(t => t.tablename).join(', ')}`);

      const requiredTables = ['users', 'pcr_records'];
      const missingTables = requiredTables.filter(
        t => !pubTables.some(pt => pt.tablename === t)
      );

      if (missingTables.length > 0) {
        console.log(`   ⚠️  Missing tables: ${missingTables.join(', ')}`);
        console.log('   💡 Fix: Re-run wal_setup.sql to add missing tables\n');
      } else {
        console.log('   ✅ All required tables are published\n');
      }
    }

    // Check replication slot
    console.log('4️⃣  Checking replication slot "realtime_slot"...');
    const slots = await prisma.$queryRaw<Array<{
      slot_name: string;
      active: boolean;
      restart_lsn: string;
    }>>`
      SELECT slot_name, active, restart_lsn::text as restart_lsn
      FROM pg_replication_slots
      WHERE slot_name = 'realtime_slot';
    `;

    if (slots.length === 0) {
      console.log('   ⚠️  Replication slot does not exist');
      console.log('   💡 This is OK - it will be created automatically when backend starts\n');
    } else {
      const slot = slots[0];
      console.log(`   ✅ Replication slot exists`);
      console.log(`   📊 Active: ${slot.active}`);
      console.log(`   📊 LSN: ${slot.restart_lsn}`);

      if (!slot.active) {
        console.log('   ⚠️  Replication slot is INACTIVE');
        console.log('   💡 Start the backend to activate the replication stream\n');
      } else {
        console.log('   ✅ Replication slot is ACTIVE\n');
      }
    }

    // Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));

    const allGood =
      walLevel[0].wal_level === 'logical' &&
      parseInt(maxSlots[0].max_replication_slots) >= 1 &&
      publications.length > 0;

    if (allGood) {
      console.log('✅ WAL replication is properly configured!');
      console.log('💡 If real-time updates still don\'t work:');
      console.log('   1. Restart the backend to activate the replication slot');
      console.log('   2. Check backend logs for WAL connection errors');
      console.log('   3. Verify frontend is subscribing to events');
    } else {
      console.log('❌ WAL replication needs configuration');
      console.log('💡 Follow the fixes mentioned above, then restart PostgreSQL and backend');
    }

  } catch (error) {
    console.error('❌ Error checking WAL setup:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
