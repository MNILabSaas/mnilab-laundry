import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequest } from './leave-request.entity.js';
import { LeavesController } from './leaves.controller.js';
import { LeavesService } from './leaves.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveRequest])],
  controllers: [LeavesController],
  providers: [LeavesService],
  exports: [LeavesService, TypeOrmModule],
})
export class LeavesModule {}
