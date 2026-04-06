import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsDateString, IsInt, IsNumber, Min, Max } from 'class-validator';

export class CreatePcrDto {
  // Basic Information
  @ApiProperty({
    description: 'Patient identifier',
    example: 'PT-2026-001',
  })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({
    description: 'Patient full name',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  patientName!: string;

  @ApiProperty({
    description: 'Patient date of birth',
    example: '1985-06-15T00:00:00.000Z',
  })
  @IsDateString()
  dateOfBirth!: string;

  @ApiProperty({
    description: 'Patient gender',
    example: 'MALE',
    enum: ['MALE', 'FEMALE', 'OTHER'],
  })
  @IsString()
  @IsNotEmpty()
  gender!: string;

  // Incident Information
  @ApiProperty({
    description: 'Date and time of incident',
    example: '2026-03-30T14:30:00.000Z',
  })
  @IsDateString()
  incidentDate!: string;

  @ApiProperty({
    description: 'Type of incident',
    example: 'EMERGENCY',
    enum: ['EMERGENCY', 'ROUTINE', 'FOLLOW_UP'],
  })
  @IsString()
  @IsNotEmpty()
  incidentType!: string;

  @ApiProperty({
    description: 'Chief complaint or reason for visit',
    example: 'Chest pain and shortness of breath',
  })
  @IsString()
  @IsNotEmpty()
  chiefComplaint!: string;

  // Vital Signs (all optional)
  @ApiProperty({
    description: 'Blood pressure (systolic/diastolic)',
    example: '120/80',
    required: false,
  })
  @IsString()
  @IsOptional()
  bloodPressure?: string;

  @ApiProperty({
    description: 'Heart rate in BPM',
    example: 72,
    required: false,
  })
  @IsInt()
  @Min(30)
  @Max(250)
  @IsOptional()
  heartRate?: number;

  @ApiProperty({
    description: 'Body temperature in Celsius',
    example: 37.2,
    required: false,
  })
  @IsNumber()
  @Min(30)
  @Max(45)
  @IsOptional()
  temperature?: number;

  @ApiProperty({
    description: 'Respiratory rate (breaths per minute)',
    example: 16,
    required: false,
  })
  @IsInt()
  @Min(8)
  @Max(60)
  @IsOptional()
  respiratoryRate?: number;

  @ApiProperty({
    description: 'Oxygen saturation (SpO2) percentage',
    example: 98.5,
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  oxygenSaturation?: number;

  // Assessment & Treatment (all optional)
  @ApiProperty({
    description: 'Medical diagnosis',
    example: 'Suspected myocardial infarction',
    required: false,
  })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiProperty({
    description: 'Treatment plan',
    example: 'Administer aspirin, oxygen therapy, transport to cardiac unit',
    required: false,
  })
  @IsString()
  @IsOptional()
  treatmentPlan?: string;

  @ApiProperty({
    description: 'Medications administered',
    example: 'Aspirin 325mg, Nitroglycerin 0.4mg sublingual',
    required: false,
  })
  @IsString()
  @IsOptional()
  medications?: string;

  @ApiProperty({
    description: 'Procedures performed',
    example: 'ECG 12-lead, IV established',
    required: false,
  })
  @IsString()
  @IsOptional()
  procedures?: string;

  // Status & Workflow
  @ApiProperty({
    description: 'Current status of the PCR',
    example: 'OPEN',
    enum: ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'CLOSED'],
  })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiProperty({
    description: 'Priority level',
    example: 'HIGH',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
  })
  @IsString()
  @IsOptional()
  priority?: string;

  // Assignment
  @ApiProperty({
    description: 'ID of user assigned to this PCR',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsString()
  @IsOptional()
  assignedTo?: string;

  // Tenant
  @ApiProperty({
    description: 'Tenant ID (ADMIN only - for creating PCR in specific tenant)',
    example: 'tenant-a-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  tenantId?: string;

  // Additional Notes
  @ApiProperty({
    description: 'Additional notes or observations',
    example: 'Patient was alert and oriented. Family notified.',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
