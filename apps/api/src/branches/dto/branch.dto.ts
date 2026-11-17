import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/dto/transforms.js';

export class CreateBranchDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @Trim()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,20}$/, {
    message: 'Kode cabang hanya boleh huruf, angka, _ atau - (2-20 karakter)',
  })
  code: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(30)
  whatsappNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ironingRate?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(10)
  openTime?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(10)
  closeTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultMinWeightKg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payLaterFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attendanceRadiusMeters?: number;

  @IsOptional()
  @IsBoolean()
  isMain?: boolean;
}

export class UpdateBranchDto {
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
  address?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(30)
  whatsappNumber?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ironingRate?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(10)
  openTime?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(10)
  closeTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultMinWeightKg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payLaterFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attendanceRadiusMeters?: number;

  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
