import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Tenant } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all tenants with pagination
   */
  async findAll(page: number = 1, limit: number = 10): Promise<{
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
    const skip = (page - 1) * limit;

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: limit,
        orderBy: {
          name: 'asc',
        },
      }),
      this.prisma.tenant.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: tenants,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Find a tenant by ID
   */
  async findOne(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new tenant
   */
  async create(name: string): Promise<Tenant> {
    return this.prisma.tenant.create({
      data: {
        name,
      },
    });
  }
}
