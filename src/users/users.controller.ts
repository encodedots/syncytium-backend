import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserContext } from '../auth/types/user-context.interface';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Role } from '../rbac/enums/roles.enum';
import { UserFilterDto } from './dto/user-filter.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  /**
   * Get all users (filtered by RBAC) with pagination
   * ADMIN sees all tenants, others see only their own tenant
   */
  @ApiOperation({
    summary: 'Get all users with pagination',
    description: 'Returns paginated list of users filtered by RBAC permissions. ADMIN sees all tenants, others see only their own tenant.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              name: { type: 'string' },
              role: { type: 'string' },
              tenantId: { type: 'string' },
              isActive: { type: 'boolean' },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
              tenant: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
          },
        },
      },
    },
  })
  @Roles(Role.ADMIN, Role.MANAGER, Role.VIEWER)
  @Get()
  async findAll(
    @CurrentUser() user: UserContext,
    @Query() filters: UserFilterDto,
  ) {
    return this.usersService.findAll(user, filters);
  }

  /**
   * Get a single user by ID
   */
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Returns a single user filtered by RBAC permissions',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'User details',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @Roles(Role.ADMIN, Role.MANAGER, Role.VIEWER)
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: UserContext) {
    return this.usersService.findOne(id, user);
  }

  /**
   * Create a new user
   * ADMIN can create users in any tenant
   * MANAGER can create users only in their own tenant
   */
  @ApiOperation({
    summary: 'Create a new user',
    description:
      'ADMIN can create users in any tenant. MANAGER can create users only in their own tenant.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or email already exists',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: UserContext) {
    return this.usersService.create(dto, user);
  }

  /**
   * Update an existing user
   * ADMIN can update any user including role changes
   * MANAGER can update users in their tenant (except roles)
   */
  @ApiOperation({
    summary: 'Update user',
    description:
      'ADMIN can update any user including role changes. MANAGER can update users in their tenant (except roles).',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.usersService.update(id, dto, user);
  }

  /**
   * Delete a user
   * Only ADMIN can delete users
   */
  @ApiOperation({
    summary: 'Delete user',
    description: 'Only ADMIN can delete users. Cannot delete yourself.',
  })
  @ApiCookieAuth('access_token')
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete yourself',
  })
  @ApiResponse({
    status: 403,
    description: 'Only ADMIN can delete users',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @Roles(Role.ADMIN)
  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: UserContext) {
    return this.usersService.delete(id, user);
  }
}
