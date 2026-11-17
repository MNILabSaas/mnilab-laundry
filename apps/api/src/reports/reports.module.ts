import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/branch.entity.js';
import { Expense } from '../expenses/expense.entity.js';
import { LaundryOrderItem } from '../orders/laundry-order-item.entity.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { Payment } from '../payments/payment.entity.js';
import { ReportsController, ReportsService } from './reports.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LaundryOrder,
      LaundryOrderItem,
      Payment,
      Expense,
      Branch,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
