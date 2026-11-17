import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { Trim } from '../../common/dto/transforms.js';
import { ExpenseApprovalStatus, LeaveType } from '../../common/enums.js';

export class ListLeaveRequestsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(ExpenseApprovalStatus)
  status?: ExpenseApprovalStatus;
}

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class DecideLeaveRequestDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: ExpenseApprovalStatus.APPROVED | ExpenseApprovalStatus.REJECTED;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reviewNotes?: string;
}
