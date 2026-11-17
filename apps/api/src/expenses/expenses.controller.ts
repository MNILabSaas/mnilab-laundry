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
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  DecideExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense.dto.js';
import { ExpensesService } from './expenses.service.js';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get('categories')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER, UserRole.CASHIER)
  listCategories(@CurrentUser() actor: LaundryAuthUser) {
    return this.expensesService.listCategories(actor.tenantId);
  }

  @Post('categories')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.expensesService.createCategory(actor.tenantId, dto);
  }

  @Patch('categories/:id')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.expensesService.updateCategory(id, actor.tenantId, dto);
  }

  @Get()
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER, UserRole.CASHIER)
  list(
    @Query() query: ListExpensesQueryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.expensesService.listExpenses(query, actor);
  }

  @Post()
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER, UserRole.CASHIER)
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.expensesService.createExpense(dto, actor);
  }

  @Patch(':id/decide')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideExpenseDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.expensesService.decideExpense(id, dto, actor);
  }
}
