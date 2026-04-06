import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Configure SSL for RDS connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('rds.amazonaws.com')
    ? { rejectUnauthorized: false }
    : false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Helper functions
const randomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min: number, max: number, decimals: number = 1) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

// Sample data arrays
const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 'James', 'Olivia', 'Robert', 'Sophia',
                    'William', 'Ava', 'Richard', 'Isabella', 'Thomas', 'Mia', 'Charles', 'Charlotte', 'Daniel', 'Amelia'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
                   'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];

const complaints = [
  'Chest pain radiating to left arm',
  'Severe abdominal pain',
  'Difficulty breathing',
  'High fever and chills',
  'Persistent cough with blood',
  'Severe headache and dizziness',
  'Lower back pain',
  'Nausea and vomiting',
  'Allergic reaction - facial swelling',
  'Broken arm from fall',
  'Laceration requiring stitches',
  'Diabetic emergency - low blood sugar',
  'Seizure activity',
  'Suspected stroke symptoms',
  'Cardiac arrest',
  'Motor vehicle accident injuries',
  'Burns from fire',
  'Possible appendicitis',
  'Asthma attack',
  'Anaphylactic shock',
  'Food poisoning symptoms',
  'Dehydration',
  'Overdose suspected',
  'Anxiety attack',
  'Sports injury - knee pain'
];

const diagnoses = [
  'Acute myocardial infarction',
  'Acute appendicitis',
  'Pneumonia',
  'Fracture of radius',
  'Type 2 diabetes mellitus',
  'Hypertension',
  'Acute gastroenteritis',
  'Migraine',
  'Asthma exacerbation',
  'Cellulitis',
  'Urinary tract infection',
  'Concussion',
  'Laceration requiring sutures',
  'Allergic reaction',
  'Dehydration',
  'COPD exacerbation',
  'Sepsis',
  'Acute renal failure',
  'Pulmonary embolism',
  'Stroke',
  null,
];

const medications = [
  'Aspirin 325mg PO',
  'Morphine 5mg IV',
  'Epinephrine 0.3mg IM',
  'Albuterol nebulizer',
  'Normal saline 1000mL IV',
  'Nitroglycerin 0.4mg SL',
  'Dextrose 50% 25g IV',
  'Ondansetron 4mg IV',
  'Acetaminophen 1000mg PO',
  'Ibuprofen 600mg PO',
  'Fentanyl 50mcg IV',
  'Diphenhydramine 50mg IV',
  'Furosemide 40mg IV',
  'Lorazepam 2mg IV',
  null,
];

const procedures = [
  '12-lead EKG',
  'IV line established',
  'Oxygen therapy via nasal cannula',
  'Wound irrigation and dressing',
  'Splinting of fractured limb',
  'Cardiac monitoring',
  'Suturing of laceration',
  'Blood glucose monitoring',
  'Nebulizer treatment',
  'CPR performed',
  'Intubation',
  'Chest tube insertion',
  'Central line placement',
  'Arterial blood gas',
  null,
];

async function main() {
  console.log('🌱 Starting seed...\n');

  // Clear only users (but first need to handle PCR records that reference them)
  console.log('🗑️  Clearing users...');
  // Delete all users except those we'll recreate
  await prisma.user.deleteMany({
    where: {
      email: {
        notIn: ['admin@example.com', 'manager-a@example.com', 'manager-b@example.com']
      }
    }
  });
  console.log('✅ Old users cleared\n');

  // Create/Get Tenants
  console.log('📦 Creating tenants...');
  const tenantA = await prisma.tenant.upsert({
    where: { id: 'tenant-a-id' },
    update: {},
    create: {
      id: 'tenant-a-id',
      name: 'Syncytium General Hospital',
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { id: 'tenant-b-id' },
    update: {},
    create: {
      id: 'tenant-b-id',
      name: 'City Medical Center',
    },
  });

  console.log(`✅ Created/Updated tenants: ${tenantA.name}, ${tenantB.name}\n`);

  // Create/Update 3 Users
  console.log('👥 Creating/Updating users...');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      name: 'Admin User',
      role: 'ADMIN',
      tenantId: null, // ADMIN users don't need a tenant - they can see all tenants
      isActive: true,
    },
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'ADMIN',
      tenantId: null, // ADMIN users don't need a tenant - they can see all tenants
      isActive: true,
      auth0Id: null,
    },
  });
  console.log(`  ✅ ${admin.email} (${admin.role}) - Can see ALL tenants and PCR records`);

  const managerA = await prisma.user.upsert({
    where: { email: 'manager-a@example.com' },
    update: {
      name: 'Manager A',
      role: 'MANAGER',
      tenantId: tenantA.id,
      isActive: true,
    },
    create: {
      email: 'manager-a@example.com',
      name: 'Manager A',
      role: 'MANAGER',
      tenantId: tenantA.id,
      isActive: true,
      auth0Id: null,
    },
  });
  console.log(`  ✅ ${managerA.email} (${managerA.role}) - ${tenantA.name}`);

  const managerB = await prisma.user.upsert({
    where: { email: 'manager-b@example.com' },
    update: {
      name: 'Manager B',
      role: 'MANAGER',
      tenantId: tenantB.id,
      isActive: true,
    },
    create: {
      email: 'manager-b@example.com',
      name: 'Manager B',
      role: 'MANAGER',
      tenantId: tenantB.id,
      isActive: true,
      auth0Id: null,
    },
  });
  console.log(`  ✅ ${managerB.email} (${managerB.role}) - ${tenantB.name}\n`);

  const users = [admin, managerA, managerB];
  const tenants = [tenantA, tenantB];

  // Check if PCR records already exist
  const existingPcrCount = await prisma.pcrRecord.count();

  if (existingPcrCount >= 500) {
    console.log(`📋 Found ${existingPcrCount} existing PCR records.`);
    console.log(`   Updating tenant assignments to be random...\n`);

    // Get all existing PCR records
    const allPcrs = await prisma.pcrRecord.findMany();

    // Update each PCR record to randomly assign to tenant A or B
    for (const pcr of allPcrs) {
      const randomTenant = randomElement(tenants);
      const randomCreator = randomElement(users);

      await prisma.pcrRecord.update({
        where: { id: pcr.id },
        data: {
          tenantId: randomTenant.id,
          createdBy: randomCreator.id,
          assignedTo: null, // Remove user assignment
        },
      });
    }

    console.log(`✅ Updated ${allPcrs.length} PCR records with random tenant assignments\n`);
  } else {
    // Create 500 PCR Records
    console.log('📋 Creating 500 PCR records...');
    const statuses = ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'CLOSED'];
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const incidentTypes = ['EMERGENCY', 'ROUTINE', 'FOLLOW_UP'];
    const genders = ['MALE', 'FEMALE', 'OTHER'];

    let createdCount = 0;
    const batchSize = 50;

    for (let batch = 0; batch < 10; batch++) {
      const pcrBatch = [];

      for (let i = 0; i < batchSize; i++) {
        const recordNumber = batch * batchSize + i + 1;
        const patientFirstName = randomElement(firstNames);
        const patientLastName = randomElement(lastNames);
        const patientName = `${patientFirstName} ${patientLastName}`;
        const patientId = `PT-2026-${String(recordNumber).padStart(4, '0')}`;

        // Random incident date within last 60 days
        const daysAgo = randomInt(0, 60);
        const incidentDate = new Date();
        incidentDate.setDate(incidentDate.getDate() - daysAgo);
        incidentDate.setHours(randomInt(0, 23), randomInt(0, 59), 0, 0);

        // Random date of birth (18-90 years ago)
        const yearsAgo = randomInt(18, 90);
        const dateOfBirth = new Date();
        dateOfBirth.setFullYear(dateOfBirth.getFullYear() - yearsAgo);
        dateOfBirth.setMonth(randomInt(0, 11));
        dateOfBirth.setDate(randomInt(1, 28));

        const status = randomElement(statuses);
        const priority = randomElement(priorities);
        const tenant = randomElement(tenants); // Randomly assign to tenant A or B
        const creator = randomElement(users);

        // Vital signs (85% chance)
        const hasVitals = Math.random() > 0.15;

        pcrBatch.push({
          patientId,
          patientName,
          dateOfBirth,
          gender: randomElement(genders),
          incidentDate,
          incidentType: randomElement(incidentTypes),
          chiefComplaint: randomElement(complaints),

          // Vital signs
          bloodPressure: hasVitals ? `${randomInt(90, 180)}/${randomInt(60, 120)}` : null,
          heartRate: hasVitals ? randomInt(50, 150) : null,
          temperature: hasVitals ? randomFloat(35.5, 40.5, 1) : null,
          respiratoryRate: hasVitals ? randomInt(12, 30) : null,
          oxygenSaturation: hasVitals ? randomFloat(88, 100, 1) : null,

          // Assessment & Treatment (65% chance)
          diagnosis: Math.random() > 0.35 ? randomElement(diagnoses) : null,
          treatmentPlan: Math.random() > 0.35 ? 'Standard treatment protocol followed per clinical guidelines. Patient monitored continuously.' : null,
          medications: Math.random() > 0.35 ? randomElement(medications) : null,
          procedures: Math.random() > 0.35 ? randomElement(procedures) : null,

          status,
          priority,
          assignedTo: null, // No user assignment anymore
          createdBy: creator.id,
          tenantId: tenant.id, // Randomly assigned to tenant A or B
          notes: Math.random() > 0.5
            ? 'Patient stable and responsive. Family notified. No complications observed.'
            : Math.random() > 0.5
            ? 'Follow-up scheduled. Patient education provided. Questions answered.'
            : null,
          completedAt: (status === 'COMPLETED' || status === 'CLOSED')
            ? new Date(incidentDate.getTime() + randomInt(1, 12) * 60 * 60 * 1000)
            : null,
        });
      }

      // Insert batch
      await prisma.pcrRecord.createMany({
        data: pcrBatch,
        skipDuplicates: true,
      });

      createdCount += batchSize;
      console.log(`  ${createdCount}/500 ✅ Created batch ${batch + 1}/10`);
    }

    console.log('\n✅ Created 500 PCR records\n');
  }

  // Summary Statistics
  const userCount = await prisma.user.count();
  const pcrCount = await prisma.pcrRecord.count();
  const tenantCount = await prisma.tenant.count();
  const tenantAPcrCount = await prisma.pcrRecord.count({ where: { tenantId: tenantA.id } });
  const tenantBPcrCount = await prisma.pcrRecord.count({ where: { tenantId: tenantB.id } });

  console.log('═══════════════════════════════════════════');
  console.log('📊 SEED SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log(`  🏥 Tenants: ${tenantCount}`);
  console.log(`  👥 Users: ${userCount}`);
  console.log(`  📋 Total PCR Records: ${pcrCount}`);
  console.log(`     • ${tenantA.name}: ${tenantAPcrCount} records`);
  console.log(`     • ${tenantB.name}: ${tenantBPcrCount} records`);
  console.log('═══════════════════════════════════════════\n');

  console.log('🔑 Test Users (Configure in Auth0):');
  console.log('───────────────────────────────────────────');
  console.log('\n📌 ADMIN:');
  console.log(`  • ${admin.email}`);
  console.log(`    Role: ${admin.role}`);
  console.log(`    Can view: ALL ${pcrCount} PCR records\n`);

  console.log('📌 MANAGER A:');
  console.log(`  • ${managerA.email}`);
  console.log(`    Role: ${managerA.role}`);
  console.log(`    Tenant: ${tenantA.name}`);
  console.log(`    Can view: ${tenantAPcrCount} PCR records\n`);

  console.log('📌 MANAGER B:');
  console.log(`  • ${managerB.email}`);
  console.log(`    Role: ${managerB.role}`);
  console.log(`    Tenant: ${tenantB.name}`);
  console.log(`    Can view: ${tenantBPcrCount} PCR records\n`);

  console.log('═══════════════════════════════════════════');
  console.log('✨ Database seeded successfully!');
  console.log('═══════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
