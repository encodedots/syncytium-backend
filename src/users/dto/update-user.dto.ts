import { IsEmail, IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../rbac/enums/roles.enum';

export class UpdateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'User role (ADMIN only)',
    enum: Role,
    example: Role.MANAGER,
    required: false,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({
    description: 'Tenant ID (for MANAGER users)',
    example: 'tenant-a-id',
    required: false,
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({
    description: 'User active status',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Auth0 user ID',
    example: 'auth0|123456789',
    required: false,
  })
  @IsOptional()
  @IsString()
  auth0Id?: string;
}
