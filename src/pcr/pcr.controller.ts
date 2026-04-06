import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { PcrService } from './pcr.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserContext } from '../auth/types/user-context.interface';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Role } from '../rbac/enums/roles.enum';
import { CreatePcrDto } from './dto/create-pcr.dto';
import { UpdatePcrDto } from './dto/update-pcr.dto';
import { PcrFilterDto } from './dto/pcr-filter.dto';

@ApiTags('PCR')
@Controller('pcr')
export class PcrController {
  constructor(private pcrService: PcrService) {}

  /**
   * Get all PCR records (filtered by RBAC)
   * ADMIN sees all tenants, others see only their own tenant
   */
  @ApiOperation({
    summary: 'Get all PCR records',
    description:
      'Returns list of PCR records filtered by RBAC permissions. ADMIN sees all tenants, others see only their own tenant.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'List of PCR records',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string' },
          tenantId: { type: 'string' },
          assignedTo: { type: 'string', nullable: true },
          createdBy: { type: 'string' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
          tenant: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
          creator: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
          assignedUser: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @Roles(Role.ADMIN, Role.MANAGER, Role.VIEWER)
  @Get()
  async findAll(
    @CurrentUser() user: UserContext,
    @Query() filters: PcrFilterDto,
  ) {
    return this.pcrService.findAll(user, filters);
  }

  /**
   * Create a new PCR record
   * Only ADMIN and MANAGER can create
   */
  @ApiOperation({
    summary: 'Create PCR record',
    description: 'Create a new PCR record in the user\'s tenant.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 201,
    description: 'PCR record created successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  async create(
    @Body() dto: CreatePcrDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.pcrService.create(dto, user);
  }

  /**
   * Update a PCR record
   * Only ADMIN and MANAGER can update
   */
  @ApiOperation({
    summary: 'Update PCR record',
    description: 'Update an existing PCR record.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'PCR record updated successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'PCR record not found',
  })
  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePcrDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.pcrService.update(id, dto, user);
  }

  /**
   * Delete a PCR record
   * Only ADMIN can delete
   */
  @ApiOperation({
    summary: 'Delete PCR record',
    description: 'Delete a PCR record. Admin only.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'PCR record deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin only',
  })
  @ApiResponse({
    status: 404,
    description: 'PCR record not found',
  })
  @Roles(Role.ADMIN)
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.pcrService.delete(id);
  }
}
