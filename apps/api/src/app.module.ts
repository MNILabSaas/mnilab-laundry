import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendancesModule } from './attendances/attendances.module.js';
import {
  EntitlementAndDemoGuard,
  LaundryJwtAuthGuard,
  RolesGuard,
} from './auth/auth.guards.js';
import { AuthModule } from './auth/auth.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { CashSettlementsModule } from './cash-settlements/cash-settlements.module.js';
import { securityMiddleware } from './common/security/security-headers.middleware.js';
import { CustomersModule } from './customers/customers.module.js';
import { buildLaundryDataSourceOptions } from './database/database.config.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { HealthController } from './health/health.controller.js';
import { LaundryServicesModule } from './laundry-services/laundry-services.module.js';
import { LeavesModule } from './leaves/leaves.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { PublicTrackingModule } from './public-tracking/public-tracking.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { StaffModule } from './staff/staff.module.js';
import { PublicBrandingController } from './tenant-context/public-branding.controller.js';
import { TenantContextMiddleware } from './tenant-context/tenant-context.middleware.js';
import { TenantProfile } from './tenant-context/tenant-profile.entity.js';
import { WorkflowModule } from './workflow/workflow.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildLaundryDataSourceOptions(process.env),
    }),
    TypeOrmModule.forFeature([TenantProfile]),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const env = process.env.NODE_ENV;
        const configured = process.env.JWT_SECRET?.trim();
        const allowDevFallback = env === 'development' || env === 'test';
        if (!configured && !allowDevFallback) {
          throw new Error(
            'JWT_SECRET wajib diatur (minimal 32 karakter). Fallback hanya untuk NODE_ENV=development/test.',
          );
        }
        const secret = configured || 'mnilab-laundry-dev-secret-change-2026';
        if (!allowDevFallback && secret.length < 32) {
          throw new Error('JWT_SECRET wajib minimal 32 karakter');
        }
        return {
          secret,
          signOptions: { expiresIn: '12h', algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    PlatformModule,
    AuthModule,
    BranchesModule,
    StaffModule,
    CustomersModule,
    LaundryServicesModule,
    OrdersModule,
    WorkflowModule,
    PaymentsModule,
    ExpensesModule,
    CashSettlementsModule,
    AttendancesModule,
    LeavesModule,
    ReportsModule,
    PublicTrackingModule,
  ],
  controllers: [HealthController, PublicBrandingController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: LaundryJwtAuthGuard },
    { provide: APP_GUARD, useClass: EntitlementAndDemoGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(securityMiddleware, TenantContextMiddleware).forRoutes('*');
  }
}
