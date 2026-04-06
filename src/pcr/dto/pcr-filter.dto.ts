import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class PcrFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search term for patient name or patient ID',
    example: 'John',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'CLOSED'],
    example: 'OPEN',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    example: 'HIGH',
  })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({
    description: 'Filter by incident type',
    enum: ['EMERGENCY', 'ROUTINE', 'FOLLOW_UP'],
    example: 'EMERGENCY',
  })
  @IsOptional()
  @IsString()
  incidentType?: string;
}
