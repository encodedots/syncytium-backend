import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({
    summary: 'Health check',
    description: 'Returns a welcome message to verify the API is running',
  })
  @ApiResponse({
    status: 200,
    description: 'API is healthy',
    schema: { type: 'string', example: 'Real-Time Data Sync POC - API Running' },
  })
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns service health status for Docker healthchecks',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-03-30T12:00:00.000Z' },
      },
    },
  })
  @Public()
  @Get('health')
  healthCheck(): object {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
