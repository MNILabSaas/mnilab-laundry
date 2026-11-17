import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../common/dto/transforms.js';
import { IsSafeImageUri } from '../../common/utils/security.js';

export class ClockAttendanceDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsEnum(['CHECK_IN', 'CHECK_OUT'])
  action?: 'CHECK_IN' | 'CHECK_OUT';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsSafeImageUri()
  photo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  faceMatchScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  faceDistance?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class MonthlyAttendanceQueryDto {
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
