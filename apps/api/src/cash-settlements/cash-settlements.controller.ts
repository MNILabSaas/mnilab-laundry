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
import { CashSettlementsService } from './cash-settlements.service.js';
import {
  DecideCashSettlementDto,
  ListCashSettlementsQueryDto,
  SubmitCashSettlementDto,
} from './dto/cash-settlement.dto.js';

@Controller('cash-settlements')
export class CashSettlementsController {
  constructor(private readonly service: CashSettlementsService) {}

  @Post()
  @Roles(UserRole.CASHIER, UserRole.BRANCH_OWNER, UserRole.SUPER_OWNER)
  submit(
    @Body() dto: SubmitCashSettlementDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.service.submit(dto, actor);
  }

  @Get('by-date')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_OWNER, UserRole.SUPER_OWNER)
  getByDate(
    @Query('date') date: string,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.service.getByDate(date, branchId, actor);
  }

  @Get()
  @Roles(UserRole.CASHIER, UserRole.BRANCH_OWNER, UserRole.SUPER_OWNER)
  list(
    @Query() query: ListCashSettlementsQueryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.service.list(query, actor);
  }

  @Patch(':id/decide')
  @Roles(UserRole.BRANCH_OWNER, UserRole.SUPER_OWNER)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideCashSettlementDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.service.decide(id, dto, actor);
  }
}
