import { Type } from 'class-transformer';
import {
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
import { Trim } from '../../common/dto/transforms.js';
import { ItemStatus } from '../../common/enums.js';
import { IsSafeImageUri } from '../../common/utils/security.js';

export class QueueQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class TransitionItemStatusDto {
  @IsEnum(ItemStatus)
  targetStatus: ItemStatus;

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
}

export class IroningEarningsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

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
  year?: number;
}

export class RequestIroningPayoutDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  employeeNotes?: string;
}

export class ListIroningPayoutsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
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
