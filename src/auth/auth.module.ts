import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Auth0ManagementService } from './services/auth0-management.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, Auth0ManagementService],
  exports: [AuthService, JwtAuthGuard, Auth0ManagementService],
})
export class AuthModule {}
