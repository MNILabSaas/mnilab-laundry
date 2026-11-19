import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type LaundryAuthUser,
  Roles,
} from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import type { TenantBankAccountItem } from '../tenant-context/tenant-profile.entity.js';
import {
  CreatePaymentDto,
  ListPaymentsQueryDto,
  UpdatePaymentStatusDto,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('qris-reconciliation')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  getQrisReconciliation(
    @Query('month') month: string | undefined,
    @Query('year') year: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.paymentsService.getQrisReconciliationForTenant(actor, {
      month: month !== undefined ? Number(month) : undefined,
      year: year !== undefined ? Number(year) : undefined,
      branchId,
    });
  }

  @Post('qris-withdrawals/request')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  requestQrisWithdrawal(
    @Body()
    body: {
      branchId: string;
      month: number;
      year: number;
      ownerNotes?: string;
      targetBankAccount?: TenantBankAccountItem;
    },
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.paymentsService.requestQrisWithdrawal(body, actor);
  }

  @Put('qris-bank-accounts')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  updateQrisBankAccounts(
    @Body() body: { bankAccounts: TenantBankAccountItem[] },
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.paymentsService.updateTenantBankAccounts(
      body?.bankAccounts ?? [],
      actor,
    );
  }

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
