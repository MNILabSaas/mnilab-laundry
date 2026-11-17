import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaundryOrderItem } from '../orders/laundry-order-item.entity.js';
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
    ]),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService, TypeOrmModule],
})
export class WorkflowModule {}
