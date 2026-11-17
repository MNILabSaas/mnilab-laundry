import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type LaundryAuthUser,
  Roles,
} from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import {
  CreatePaymentDto,
  ListPaymentsQueryDto,
  UpdatePaymentStatusDto,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER, UserRole.CASHIER)
  list(
    @Query() query: ListPaymentsQueryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.paymentsService.list(query, actor);
  }

  @Post()
  @Roles(UserRole.CASHIER, UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  create(@Body() dto: CreatePaymentDto, @CurrentUser() actor: LaundryAuthUser) {
    return this.paymentsService.create(dto, actor);
  }

  @Patch(':id/status')
  @Roles(UserRole.CASHIER, UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentStatusDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.paymentsService.updateStatus(id, dto, actor);
  }
}
