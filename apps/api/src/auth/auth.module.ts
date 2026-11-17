import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { TenantProfile } from '../tenant-context/tenant-profile.entity.js';
import { AuthController } from './auth.controller.js';
import {
  EntitlementAndDemoGuard,
  LaundryJwtAuthGuard,
  RolesGuard,
} from './auth.guards.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LaundryStaff, TenantProfile])],
  controllers: [AuthController],
  providers: [
    AuthService,
    LaundryJwtAuthGuard,
    EntitlementAndDemoGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    LaundryJwtAuthGuard,
    EntitlementAndDemoGuard,
    RolesGuard,
    TypeOrmModule,
  ],
})
export class AuthModule {}
