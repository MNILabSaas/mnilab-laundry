import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  type LaundryAuthUser,
  Roles,
} from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { AttendancesService } from './attendances.service.js';
import {
  ClockAttendanceDto,
  MonthlyAttendanceQueryDto,
} from './dto/attendance.dto.js';

@Controller('attendances')
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  @Get('branch-candidates')
  @Roles(
    UserRole.CASHIER,
    UserRole.WASHING,
    UserRole.BRANCH_OWNER,
    UserRole.SUPER_OWNER,
  )
  getBranchCandidates(
    @CurrentUser() actor: LaundryAuthUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.attendancesService.getBranchCandidates(actor, branchId);
  }

  @Post('clock')
  @Roles(UserRole.CASHIER, UserRole.WASHING, UserRole.IRONING, UserRole.SUPER_OWNER)
  clock(
    @Body() dto: ClockAttendanceDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.attendancesService.clockAttendance(dto, actor);
  }

  @Get('monthly-summary')
  @Roles(
    UserRole.SUPER_OWNER,
    UserRole.BRANCH_OWNER,
    UserRole.CASHIER,
    UserRole.WASHING,
    UserRole.IRONING,
  )
  getMonthlySummary(
    @CurrentUser() actor: LaundryAuthUser,
    @Query() query: MonthlyAttendanceQueryDto,
  ) {
    return this.attendancesService.getMonthlySummary(actor, query);
  }
}
