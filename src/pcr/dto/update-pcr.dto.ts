import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsInt, IsNumber, Min, Max } from 'class-validator';

export class UpdatePcrDto {
  // Basic Information (rarely updated)
  @ApiProperty({
    description: 'Patient identifier',
    required: false,
  })
  @IsString()
  @IsOptional()
  patientId?: string;

  @ApiProperty({
    description: 'Patient full name',
    required: false,
  })
  @IsString()
  @IsOptional()
  patientName?: string;

  @ApiProperty({
    description: 'Patient date of birth',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty({
    description: 'Patient gender',
    enum: ['MALE', 'FEMALE', 'OTHER'],
    required: false,
  })
  @IsString()
  @IsOptional()
  gender?: string;

  // Incident Information
  @ApiProperty({
    description: 'Date and time of incident',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  incidentDate?: string;

  @ApiProperty({
    description: 'Type of incident',
    enum: ['EMERGENCY', 'ROUTINE', 'FOLLOW_UP'],
    required: false,
  })
  @IsString()
  @IsOptional()
  incidentType?: string;

  @ApiProperty({
    description: 'Chief complaint',
    required: false,
  })
  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  // Vital Signs
  @ApiProperty({
    description: 'Blood pressure',
    required: false,
  })
  @IsString()
  @IsOptional()
  bloodPressure?: string;

  @ApiProperty({
    description: 'Heart rate in BPM',
    required: false,
  })
  @IsInt()
  @Min(30)
  @Max(250)
  @IsOptional()
  heartRate?: number;

  @ApiProperty({
    description: 'Temperature in Celsius',
    required: false,
  })
  @IsNumber()
  @Min(30)
  @Max(45)
  @IsOptional()
  temperature?: number;

  @ApiProperty({
    description: 'Respiratory rate',
    required: false,
  })
  @IsInt()
  @Min(8)
  @Max(60)
  @IsOptional()
  respiratoryRate?: number;

  @ApiProperty({
    description: 'Oxygen saturation',
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  oxygenSaturation?: number;

  // Assessment & Treatment
  @ApiProperty({
    description: 'Medical diagnosis',
    required: false,
  })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiProperty({
    description: 'Treatment plan',
    required: false,
  })
  @IsString()
  @IsOptional()
  treatmentPlan?: string;

  @ApiProperty({
    description: 'Medications',
    required: false,
  })
  @IsString()
  @IsOptional()
  medications?: string;

  @ApiProperty({
    description: 'Procedures',
    required: false,
  })
  @IsString()
  @IsOptional()
  procedures?: string;

  // Status & Workflow
  @ApiProperty({
    description: 'Status',
    enum: ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'CLOSED'],
    required: false,
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({
    description: 'Priority',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: false,
  })
  @IsString()
  @IsOptional()
  priority?: string;

  // Assignment
  @ApiProperty({
    description: 'Assigned user ID',
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  assignedTo?: string | null;

  // Tenant
  @ApiProperty({
    description: 'Tenant ID (ADMIN only - for changing PCR tenant)',
    example: 'tenant-a-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  tenantId?: string;

  // Notes
  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;

  // Completion
  @ApiProperty({
    description: 'Completion timestamp',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  completedAt?: string;
}
