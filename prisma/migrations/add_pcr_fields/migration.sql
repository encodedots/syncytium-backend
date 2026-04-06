-- AlterTable: Add comprehensive Patient Care Record fields
ALTER TABLE "pcr_records" DROP COLUMN IF EXISTS "title";

ALTER TABLE "pcr_records" ADD COLUMN IF NOT EXISTS "patient_id" TEXT NOT NULL DEFAULT 'PT-MIGRATION',
ADD COLUMN IF NOT EXISTS "patient_name" TEXT NOT NULL DEFAULT 'Migration Patient',
ADD COLUMN IF NOT EXISTS "date_of_birth" TIMESTAMP(3) NOT NULL DEFAULT NOW() - INTERVAL '30 years',
ADD COLUMN IF NOT EXISTS "gender" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN IF NOT EXISTS "incident_date" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS "incident_type" TEXT NOT NULL DEFAULT 'ROUTINE',
ADD COLUMN IF NOT EXISTS "chief_complaint" TEXT NOT NULL DEFAULT 'General checkup',
ADD COLUMN IF NOT EXISTS "blood_pressure" TEXT,
ADD COLUMN IF NOT EXISTS "heart_rate" INTEGER,
ADD COLUMN IF NOT EXISTS "temperature" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "respiratory_rate" INTEGER,
ADD COLUMN IF NOT EXISTS "oxygen_saturation" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "diagnosis" TEXT,
ADD COLUMN IF NOT EXISTS "treatment_plan" TEXT,
ADD COLUMN IF NOT EXISTS "medications" TEXT,
ADD COLUMN IF NOT EXISTS "procedures" TEXT,
ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS "pcr_records_patient_id_idx" ON "pcr_records"("patient_id");
CREATE INDEX IF NOT EXISTS "pcr_records_priority_idx" ON "pcr_records"("priority");
CREATE INDEX IF NOT EXISTS "pcr_records_incident_date_idx" ON "pcr_records"("incident_date");
