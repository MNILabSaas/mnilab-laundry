import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { ToBoolean, Trim } from '../../common/dto/transforms.js';
import {
  ItemStatus,
  OrderPaymentStatus,
  PaymentMethod,
} from '../../common/enums.js';

export class CreateOrderCustomerInlineDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @Trim()
  @IsString()
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

export class InitialPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class CreateOrderItemDto {
  @IsUUID()
  serviceId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  weightKg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  garmentCount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderCustomerInlineDto)
  customer?: CreateOrderCustomerInlineDto;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(25)
  customerPhone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isPayLater?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialPaymentDto)
  initialPayment?: InitialPaymentDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialPaymentAmount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  initialPaymentMethod?: PaymentMethod;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @IsEnum(ItemStatus)
  itemStatus?: ItemStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  pickedUp?: boolean;

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

  @IsOptional()
  @Trim()
  @IsString()
  from?: string;

  @IsOptional()
  @Trim()
  @IsString()
  to?: string;
}
