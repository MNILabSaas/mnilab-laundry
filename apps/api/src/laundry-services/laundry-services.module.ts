import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaundryService } from './laundry-service.entity.js';
import { LaundryServicesController } from './laundry-services.controller.js';
import { LaundryServicesService } from './laundry-services.service.js';
import { ServicePriceHistory } from './service-price-history.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([LaundryService, ServicePriceHistory])],
  controllers: [LaundryServicesController],
  providers: [LaundryServicesService],
  exports: [LaundryServicesService, TypeOrmModule],
})
export class LaundryServicesModule {}
