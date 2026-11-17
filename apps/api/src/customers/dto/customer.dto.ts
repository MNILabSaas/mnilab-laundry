import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { Trim } from '../../common/dto/transforms.js';

export class ListCustomersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CreateCustomerDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(25)
  phone: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(25)
  phone?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
