import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/dto/transforms.js';
import { ExpenseApprovalStatus, PaymentMethod } from '../../common/enums.js';
import { IsSafeImageUri } from '../../common/utils/security.js';

export class CreateExpenseCategoryDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListExpensesQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(ExpenseApprovalStatus)
  status?: ExpenseApprovalStatus;
}

export class CreateExpenseDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsUUID()
  categoryId: string;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  description: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @IsDateString()
  expenseDate: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsSafeImageUri()
  receiptUrl?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DecideExpenseDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: ExpenseApprovalStatus.APPROVED | ExpenseApprovalStatus.REJECTED;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  approvalNotes?: string;
}
