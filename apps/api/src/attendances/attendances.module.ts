import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/branch.entity.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { Attendance } from './attendance.entity.js';
import { AttendancesController } from './attendances.controller.js';
import { AttendancesService } from './attendances.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Attendance, Branch, LaundryStaff])],
  controllers: [AttendancesController],
  providers: [AttendancesService],
  exports: [AttendancesService, TypeOrmModule],
})
export class AttendancesModule {}
