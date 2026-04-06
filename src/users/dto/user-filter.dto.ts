import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class UserFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search term for user name or email',
    example: 'John',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by role',
    enum: ['ADMIN', 'MANAGER', 'VIEWER'],
    example: 'ADMIN',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: 'Filter by status (active/inactive)',
    enum: ['active', 'inactive'],
    example: 'active',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
