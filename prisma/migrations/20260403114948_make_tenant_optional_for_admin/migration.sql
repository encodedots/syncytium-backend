-- AlterTable
ALTER TABLE "pcr_records" ALTER COLUMN "patient_id" DROP DEFAULT,
ALTER COLUMN "patient_name" DROP DEFAULT,
ALTER COLUMN "date_of_birth" DROP DEFAULT,
ALTER COLUMN "gender" DROP DEFAULT,
ALTER COLUMN "incident_date" DROP DEFAULT,
ALTER COLUMN "incident_type" DROP DEFAULT,
ALTER COLUMN "chief_complaint" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tenant_id" DROP NOT NULL;
