import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/branch.entity.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { TenantProfile } from '../tenant-context/tenant-profile.entity.js';
import { Payment } from './payment.entity.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { QrisWithdrawal } from './qris-withdrawal.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      QrisWithdrawal,
      LaundryOrder,
      Branch,
      TenantProfile,
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService, TypeOrmModule],
})
export class PaymentsModule {}
