import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { UserContext } from '../auth/types/user-context.interface';
import { CreatePcrDto } from './dto/create-pcr.dto';
import { UpdatePcrDto } from './dto/update-pcr.dto';
import {
  PaginatedResponse,
  createPaginatedResponse,
} from '../common/dto/pagination.dto';
import { PcrFilterDto } from './dto/pcr-filter.dto';

@Injectable()
export class PcrService {
  constructor(
    private prisma: PrismaService,
    private rbacService: RbacService,
  ) {}

  /**
   * Get all PCR records filtered by RBAC with pagination
   * ADMIN sees all tenants, others see only their own tenant
   */
  async findAll(
    user: UserContext,
    filters: PcrFilterDto,
  ): Promise<PaginatedResponse<any>> {
    // Get visible tenants based on role
    const visibleTenants = await this.rbacService.getVisibleTenants(user);

    // Build where clause with filters
    const where: any = {
      tenantId: { in: visibleTenants },
    };

    // Apply search filter (searches in patientName and patientId)
    if (filters.search) {
      where.OR = [
        { patientName: { contains: filters.search, mode: 'insensitive' } },
        { patientId: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Apply status filter
    if (filters.status) {
      where.status = filters.status;
    }

    // Apply priority filter
    if (filters.priority) {
      where.priority = filters.priority;
    }

    // Apply incident type filter
    if (filters.incidentType) {
      where.incidentType = filters.incidentType;
    }

    // Get total count for pagination
    const total = await this.prisma.pcrRecord.count({ where });

    // Query PCR records from visible tenants with pagination
    const records = await this.prisma.pcrRecord.findMany({
      where,
      skip: filters.skip,
      take: filters.take,
      include: {
        tenant: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Apply field filtering based on role
    const filteredRecords = records.map((record) =>
      this.rbacService.filterFieldsByRole(user, record),
    );

    // Return paginated response
    return createPaginatedResponse(
      filteredRecords,
      total,
      filters.page!,
      filters.limit!,
    );
  }

  /**
   * Create a new PCR record
   */
  async create(dto: CreatePcrDto, user: UserContext) {
    // Determine target tenant (ADMIN can specify, others use their own)
    let targetTenantId: string;

    if (user.role === 'ADMIN' && dto.tenantId) {
      targetTenantId = dto.tenantId;
    } else if (user.tenantId) {
      targetTenantId = user.tenantId;
    } else {
      // ADMIN users without tenant must specify tenantId
      throw new BadRequestException('tenantId is required for PCR records');
    }

    // Validate tenant access
    if (!this.rbacService.canAccessTenant(user, targetTenantId)) {
      throw new ForbiddenException(
        'You do not have permission to create PCR records in this tenant',
      );
    }

    // If non-ADMIN user provides tenantId different from their own, reject
    if (dto.tenantId && user.role !== 'ADMIN' && dto.tenantId !== user.tenantId) {
      throw new ForbiddenException('Only ADMIN can create PCR records in other tenants');
    }

    // If ADMIN provides tenantId, validate it exists
    if (dto.tenantId && user.role === 'ADMIN') {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: dto.tenantId },
      });

      if (!tenant) {
        throw new NotFoundException('Target tenant not found');
      }
    }

    // If assignedTo is provided, validate that user exists and is in same tenant
    if (dto.assignedTo) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: dto.assignedTo },
      });

      if (!assignedUser) {
        throw new NotFoundException('Assigned user not found');
      }

      if (assignedUser.tenantId !== targetTenantId) {
        throw new ForbiddenException(
          'Cannot assign to user in a different tenant',
        );
      }
    }

    return this.prisma.pcrRecord.create({
      data: {
        // Basic Information
        patientId: dto.patientId,
        patientName: dto.patientName,
        dateOfBirth: new Date(dto.dateOfBirth),
        gender: dto.gender,

        // Incident Information
        incidentDate: new Date(dto.incidentDate),
        incidentType: dto.incidentType,
        chiefComplaint: dto.chiefComplaint,

        // Vital Signs
        bloodPressure: dto.bloodPressure,
        heartRate: dto.heartRate,
        temperature: dto.temperature,
        respiratoryRate: dto.respiratoryRate,
        oxygenSaturation: dto.oxygenSaturation,

        // Assessment & Treatment
        diagnosis: dto.diagnosis,
        treatmentPlan: dto.treatmentPlan,
        medications: dto.medications,
        procedures: dto.procedures,

        // Status & Workflow
        status: dto.status,
        priority: dto.priority || 'MEDIUM',

        // Assignment
        assignedTo: dto.assignedTo || null,
        createdBy: user.id,

        // Additional Notes
        notes: dto.notes,

        // Tenant
        tenantId: targetTenantId,
      },
      include: {
        tenant: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Update a PCR record
   */
  async update(id: string, dto: UpdatePcrDto, user: UserContext) {
    // Check if record exists
    const record = await this.prisma.pcrRecord.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('PCR record not found');
    }

    // Check RBAC permissions
    if (!this.rbacService.canAccessTenant(user, record.tenantId)) {
      throw new ForbiddenException(
        'You do not have permission to update this PCR record',
      );
    }

    // If tenantId is being changed, validate (ADMIN only)
    if (dto.tenantId !== undefined && dto.tenantId !== record.tenantId) {
      // Only ADMIN can change tenant
      if (user.role !== 'ADMIN') {
        throw new ForbiddenException('Only ADMIN can change PCR record tenant');
      }

      // Validate the new tenant exists
      const newTenant = await this.prisma.tenant.findUnique({
        where: { id: dto.tenantId },
      });

      if (!newTenant) {
        throw new NotFoundException('Target tenant not found');
      }
    }

    // If assignedTo is being changed, validate the new user
    if (dto.assignedTo !== undefined) {
      if (dto.assignedTo) {
        const assignedUser = await this.prisma.user.findUnique({
          where: { id: dto.assignedTo },
        });

        if (!assignedUser) {
          throw new NotFoundException('Assigned user not found');
        }

        // If changing tenant, validate against new tenant; otherwise against current tenant
        const targetTenantId = dto.tenantId !== undefined ? dto.tenantId : record.tenantId;
        if (!this.rbacService.canAccessTenant(user, assignedUser.tenantId) &&
            assignedUser.tenantId !== targetTenantId) {
          throw new ForbiddenException(
            'Cannot assign to user in a different tenant',
          );
        }
      }
    }

    return this.prisma.pcrRecord.update({
      where: { id },
      data: {
        // Basic Information
        ...(dto.patientId !== undefined && { patientId: dto.patientId }),
        ...(dto.patientName !== undefined && { patientName: dto.patientName }),
        ...(dto.dateOfBirth !== undefined && { dateOfBirth: new Date(dto.dateOfBirth) }),
        ...(dto.gender !== undefined && { gender: dto.gender }),

        // Incident Information
        ...(dto.incidentDate !== undefined && { incidentDate: new Date(dto.incidentDate) }),
        ...(dto.incidentType !== undefined && { incidentType: dto.incidentType }),
        ...(dto.chiefComplaint !== undefined && { chiefComplaint: dto.chiefComplaint }),

        // Vital Signs
        ...(dto.bloodPressure !== undefined && { bloodPressure: dto.bloodPressure }),
        ...(dto.heartRate !== undefined && { heartRate: dto.heartRate }),
        ...(dto.temperature !== undefined && { temperature: dto.temperature }),
        ...(dto.respiratoryRate !== undefined && { respiratoryRate: dto.respiratoryRate }),
        ...(dto.oxygenSaturation !== undefined && { oxygenSaturation: dto.oxygenSaturation }),

        // Assessment & Treatment
        ...(dto.diagnosis !== undefined && { diagnosis: dto.diagnosis }),
        ...(dto.treatmentPlan !== undefined && { treatmentPlan: dto.treatmentPlan }),
        ...(dto.medications !== undefined && { medications: dto.medications }),
        ...(dto.procedures !== undefined && { procedures: dto.procedures }),

        // Status & Workflow
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.priority !== undefined && { priority: dto.priority }),

        // Assignment
        ...(dto.assignedTo !== undefined && { assignedTo: dto.assignedTo || null }),

        // Tenant (ADMIN only)
        ...(dto.tenantId !== undefined && { tenantId: dto.tenantId }),

        // Additional Notes
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        tenant: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Delete a PCR record
   * Only ADMIN can delete (enforced by controller @Roles decorator)
   */
  async delete(id: string) {
    // Check if record exists
    const record = await this.prisma.pcrRecord.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('PCR record not found');
    }

    await this.prisma.pcrRecord.delete({
      where: { id },
    });

    return { success: true, message: 'PCR record deleted successfully' };
  }
}
