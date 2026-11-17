import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/branch.entity.js';
import { ExpenseCategory } from '../expenses/expense-category.entity.js';
import { Expense } from '../expenses/expense.entity.js';
import { LaundryOrderItem } from '../orders/laundry-order-item.entity.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { IroningPayout } from './ironing-payout.entity.js';
import { OrderStatusHistory } from './order-status-history.entity.js';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LaundryOrderItem,
      OrderStatusHistory,
      IroningPayout,
      Branch,
      LaundryStaff,
      Expense,
      ExpenseCategory,
    ]),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService, TypeOrmModule],
})
export class WorkflowModule {}
