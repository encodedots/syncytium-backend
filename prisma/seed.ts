import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // Create Tenants
  console.log('Creating tenants...');
  const tenantA = await prisma.tenant.upsert({
    where: { id: 'tenant-a-id' },
    update: {},
    create: {
      id: 'tenant-a-id',
      name: 'Tenant A',
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { id: 'tenant-b-id' },
    update: {},
    create: {
      id: 'tenant-b-id',
      name: 'Tenant B',
    },
  });

  console.log(`✅ Created tenants: ${tenantA.name}, ${tenantB.name}`);

  // Create Roles
  console.log('Creating roles...');
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      permissions: ['*'], // Admin has all permissions
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: 'MANAGER' },
    update: {},
    create: {
      name: 'MANAGER',
      permissions: ['tenant:read', 'tenant:write', 'tenant:delete'],
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { name: 'VIEWER' },
    update: {},
    create: {
      name: 'VIEWER',
      permissions: ['tenant:read'],
    },
  });

  console.log('✅ Created roles: ADMIN, MANAGER, VIEWER');

  // Create Users
  console.log('Creating users...');
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      tenantId: tenantA.id,
      role: 'ADMIN',
      auth0Id: null, // Will be set when they first login via Auth0
      isActive: true,
    },
  });

  const managerA = await prisma.user.upsert({
    where: { email: 'manager-a@example.com' },
    update: {},
    create: {
      email: 'manager-a@example.com',
      name: 'Manager A',
      tenantId: tenantA.id,
      role: 'MANAGER',
      auth0Id: null,
      isActive: true,
    },
  });

  const managerB = await prisma.user.upsert({
    where: { email: 'manager-b@example.com' },
    update: {},
    create: {
      email: 'manager-b@example.com',
      name: 'Manager B',
      tenantId: tenantB.id,
      role: 'MANAGER',
      auth0Id: null,
      isActive: true,
    },
  });

  const viewerA = await prisma.user.upsert({
    where: { email: 'viewer-a@example.com' },
    update: {},
    create: {
      email: 'viewer-a@example.com',
      name: 'Viewer A',
      tenantId: tenantA.id,
      role: 'VIEWER',
      auth0Id: null,
      isActive: true,
    },
  });

  console.log('✅ Created 4 users across both tenants');

  // Create PCR Records
  console.log('Creating PCR records...');
  const pcr1 = await prisma.pcrRecord.create({
    data: {
      title: 'PCR Test - Sample 001',
      status: 'pending',
      tenantId: tenantA.id,
      createdBy: adminUser.id,
      assignedTo: managerA.id,
    },
  });

  const pcr2 = await prisma.pcrRecord.create({
    data: {
      title: 'PCR Test - Sample 002',
      status: 'in_progress',
      tenantId: tenantA.id,
      createdBy: managerA.id,
      assignedTo: managerA.id,
    },
  });

  const pcr3 = await prisma.pcrRecord.create({
    data: {
      title: 'PCR Test - Sample 003',
      status: 'completed',
      tenantId: tenantA.id,
      createdBy: adminUser.id,
      assignedTo: null,
    },
  });

  const pcr4 = await prisma.pcrRecord.create({
    data: {
      title: 'PCR Test - Sample 004',
      status: 'pending',
      tenantId: tenantB.id,
      createdBy: managerB.id,
      assignedTo: managerB.id,
    },
  });

  const pcr5 = await prisma.pcrRecord.create({
    data: {
      title: 'PCR Test - Sample 005',
      status: 'in_progress',
      tenantId: tenantB.id,
      createdBy: managerB.id,
      assignedTo: managerB.id,
    },
  });

  console.log('✅ Created 5 PCR records (3 in Tenant A, 2 in Tenant B)');

  console.log('\n🎉 Database seeded successfully!\n');
  console.log('Test Users (for Auth0 configuration):');
  console.log('--------------------------------------------');
  console.log('1. admin@example.com (Tenant A, ADMIN)');
  console.log('   - Can see all tenants');
  console.log('   - Full CRUD access everywhere');
  console.log('');
  console.log('2. manager-a@example.com (Tenant A, MANAGER)');
  console.log('   - Can see only Tenant A data');
  console.log('   - Full CRUD within Tenant A');
  console.log('');
  console.log('3. manager-b@example.com (Tenant B, MANAGER)');
  console.log('   - Can see only Tenant B data');
  console.log('   - Full CRUD within Tenant B');
  console.log('');
  console.log('4. viewer-a@example.com (Tenant A, VIEWER)');
  console.log('   - Can see only Tenant A data');
  console.log('   - Read-only access with restricted fields');
  console.log('--------------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
