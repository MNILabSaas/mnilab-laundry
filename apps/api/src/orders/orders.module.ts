import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/branch.entity.js';
import { Customer } from '../customers/customer.entity.js';
import { LaundryService } from '../laundry-services/laundry-service.entity.js';
import { Payment } from '../payments/payment.entity.js';
import { OrderStatusHistory } from '../workflow/order-status-history.entity.js';
import { LaundryOrderItem } from './laundry-order-item.entity.js';
import { LaundryOrder } from './laundry-order.entity.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LaundryOrder,
      LaundryOrderItem,
      OrderStatusHistory,
      Payment,
      Branch,
      Customer,
      LaundryService,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
