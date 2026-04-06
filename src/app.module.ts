import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { RealtimeModule } from './realtime/realtime.module';
import { UsersModule } from './users/users.module';
import { PcrModule } from './pcr/pcr.module';
import { TenantsModule } from './tenants/tenants.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      envFilePath: '../.env',
    }),
    PrismaModule,
    AuthModule,
    RbacModule,
    RealtimeModule,
    UsersModule,
    PcrModule,
    TenantsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
