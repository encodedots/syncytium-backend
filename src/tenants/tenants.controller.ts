import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Tenant } from '@prisma/client';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * GET /tenants - Get all tenants with pagination
   */
  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<{
    data: Tenant[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    return this.tenantsService.findAll(page, limit);
  }

  /**
   * GET /tenants/:id - Get a single tenant by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Tenant | null> {
    return this.tenantsService.findOne(id);
  }

  /**
   * POST /tenants - Create a new tenant
   */
  @Post()
  async create(@Body('name') name: string): Promise<Tenant> {
    return this.tenantsService.create(name);
  }
}
