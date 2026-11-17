import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/branch.entity.js';
import { LaundryStaff } from './laundry-staff.entity.js';
import {
  StaffController,
  UsersCompatController,
} from './staff.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LaundryStaff, Branch])],
  controllers: [StaffController, UsersCompatController],
  providers: [StaffService],
  exports: [StaffService, TypeOrmModule],
})
export class StaffModule {}
