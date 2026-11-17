import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../expenses/expense.entity.js';
import { Payment } from '../payments/payment.entity.js';
import { CashSettlement } from './cash-settlement.entity.js';
import { CashSettlementsController } from './cash-settlements.controller.js';
import { CashSettlementsService } from './cash-settlements.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CashSettlement, Payment, Expense])],
  controllers: [CashSettlementsController],
  providers: [CashSettlementsService],
  exports: [CashSettlementsService, TypeOrmModule],
})
export class CashSettlementsModule {}
