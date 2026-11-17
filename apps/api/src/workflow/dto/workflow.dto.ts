import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { ToBoolean, Trim } from '../../common/dto/transforms.js';
import { ExpenseApprovalStatus, ItemStatus } from '../../common/enums.js';
import { IsSafeImageUri } from '../../common/utils/security.js';

export class QueueQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  mineOnly?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class TransitionItemStatusDto {
  @IsOptional()
  @IsEnum(ItemStatus)
  toStatus?: ItemStatus;

  @IsOptional()
  @IsEnum(ItemStatus)
  targetStatus?: ItemStatus;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  rackNumber?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class AssignRackDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  rackNumber: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  markCompleted?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class IroningEarningsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Trim()
  @IsString()
  from?: string;

  @IsOptional()
  @Trim()
  @IsString()
  to?: string;
}

export class RequestIroningPayoutDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  employeeNotes?: string;
}

export class ListIroningPayoutsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(ExpenseApprovalStatus)
  status?: ExpenseApprovalStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}

export class ApproveIroningPayoutDto {
  @IsOptional()
  @IsSafeImageUri()
  transferProof?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  paymentNotes?: string;
}

export class RejectIroningPayoutDto {
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  rejectionReason: string;
}
