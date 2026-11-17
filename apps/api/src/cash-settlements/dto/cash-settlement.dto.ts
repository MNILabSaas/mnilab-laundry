import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../common/dto/transforms.js';
import { ExpenseApprovalStatus } from '../../common/enums.js';

export class SubmitCashSettlementDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsDateString()
  settlementDate: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualCash: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  cashierNotes?: string;
}

export class ListCashSettlementsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class DecideCashSettlementDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: ExpenseApprovalStatus.APPROVED | ExpenseApprovalStatus.REJECTED;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reviewNotes?: string;
}
