import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/branch.entity.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import {
  PublicTrackingController,
  PublicTrackingService,
} from './public-tracking.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LaundryOrder, Branch])],
  controllers: [PublicTrackingController],
  providers: [PublicTrackingService],
})
export class PublicTrackingModule {}
