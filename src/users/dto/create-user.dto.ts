import { IsEmail, IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../rbac/enums/roles.enum';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'User role',
    enum: Role,
    example: Role.VIEWER,
  })
  @IsEnum(Role)
  role!: Role;

  @ApiProperty({
    description: 'Tenant ID (required for non-ADMIN users)',
    example: 'tenant-a-id',
    required: false,
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({
    description: 'Auth0 user ID (optional)',
    example: 'auth0|123456789',
    required: false,
  })
  @IsOptional()
  @IsString()
  auth0Id?: string;

  @ApiProperty({
    description: 'User active status',
    example: true,
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
