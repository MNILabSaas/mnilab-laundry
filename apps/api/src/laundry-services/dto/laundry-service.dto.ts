import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/dto/transforms.js';
import { PriceUnit, WorkflowCode } from '../../common/enums.js';

export class ListLaundryServicesQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreateLaundryServiceDto {
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(WorkflowCode)
  workflow: WorkflowCode;

  @IsEnum(PriceUnit)
  priceUnit: PriceUnit;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  minWeightKg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedDurationHours?: number | null;

  @IsOptional()
  @IsEnum(['NONE', 'PERCENTAGE', 'FIXED'])
  discountType?: 'NONE' | 'PERCENTAGE' | 'FIXED';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsBoolean()
  discountActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isThirdParty?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  thirdPartyPartner?: string;
}

export class UpdateLaundryServiceDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsEnum(WorkflowCode)
  workflow?: WorkflowCode;

  @IsOptional()
  @IsEnum(PriceUnit)
  priceUnit?: PriceUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  minWeightKg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedDurationHours?: number | null;

  @IsOptional()
  @IsEnum(['NONE', 'PERCENTAGE', 'FIXED'])
  discountType?: 'NONE' | 'PERCENTAGE' | 'FIXED';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsBoolean()
  discountActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isThirdParty?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(150)
  thirdPartyPartner?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  priceChangeReason?: string;
}
