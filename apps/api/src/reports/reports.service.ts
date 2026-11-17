import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import {
  CurrentUser,
  type LaundryAuthUser,
  Roles,
} from '../common/auth/auth.decorators.js';
import {
  ExpenseApprovalStatus,
  PaymentStatus,
  UserRole,
} from '../common/enums.js';
import { subtractMoney, sumMoney } from '../common/utils/money.js';
import { resolveActorBranchScope } from '../common/utils/scope.js';
import { Expense } from '../expenses/expense.entity.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { Payment } from '../payments/payment.entity.js';

export class ReportRangeQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(LaundryOrder)
    private readonly ordersRepo: Repository<LaundryOrder>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
  ) {}

  async summary(query: ReportRangeQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const now = new Date();
    const fromStr =
      query.from ??
      new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const toStr = query.to ?? now.toISOString().slice(0, 10);

    const start = new Date(`${fromStr}T00:00:00.000Z`);
    const end = new Date(`${toStr}T23:59:59.999Z`);

    const orderQb = this.ordersRepo
      .createQueryBuilder('o')
      .where('o.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('o.receivedAt BETWEEN :start AND :end', { start, end });
    if (branchId) orderQb.andWhere('o.branchId = :branchId', { branchId });
    const orders = await orderQb.getMany();

    const payQb = this.paymentsRepo
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('p.status = :status', { status: PaymentStatus.SUCCESS })
      .andWhere('p.paidAt BETWEEN :start AND :end', { start, end });
    if (branchId) payQb.andWhere('p.branchId = :branchId', { branchId });
    const payments = await payQb.getMany();

    const expQb = this.expensesRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.category', 'cat')
      .where('e.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('e.approvalStatus = :approved', {
        approved: ExpenseApprovalStatus.APPROVED,
      })
      .andWhere('e.expenseDate BETWEEN :fromStr AND :toStr', { fromStr, toStr });
    if (branchId) expQb.andWhere('e.branchId = :branchId', { branchId });
    const expenses = await expQb.getMany();

    const totalRevenueBilled = sumMoney(orders.map((o) => Number(o.total)));
    const totalPaymentsCollected = sumMoney(payments.map((p) => Number(p.amount)));
    const totalOutstanding = sumMoney(
      orders.map((o) => Math.max(0, Number(o.total) - Number(o.paidAmount))),
    );
    const totalExpenses = sumMoney(expenses.map((e) => Number(e.amount)));
    const netCashflow = subtractMoney(totalPaymentsCollected, totalExpenses);

    const paymentByMethod: Record<string, number> = {};
    for (const p of payments) {
      paymentByMethod[p.method] = sumMoney([
        paymentByMethod[p.method] ?? 0,
        Number(p.amount),
      ]);
    }

    const expenseByCategory: Record<string, number> = {};
    for (const e of expenses) {
      const catName = e.category?.name || 'Lainnya';
      expenseByCategory[catName] = sumMoney([
        expenseByCategory[catName] ?? 0,
        Number(e.amount),
      ]);
    }

    let branchComparison:
      | Array<{
          branchId: string;
          branchName: string;
          branchCode: string;
          orderCount: number;
          totalRevenue: number;
          totalPayments: number;
        }>
      | undefined;

    if (actor.role === UserRole.SUPER_OWNER && !branchId) {
      const branches = await this.branchesRepo.find({
        where: { tenantId: actor.tenantId, isActive: true },
        order: { isMain: 'DESC', name: 'ASC' },
      });
      branchComparison = branches.map((b) => {
        const bOrders = orders.filter((o) => o.branchId === b.id);
        const bPays = payments.filter((p) => p.branchId === b.id);
        return {
          branchId: b.id,
          branchName: b.name,
          branchCode: b.code,
          orderCount: bOrders.length,
          totalRevenue: sumMoney(bOrders.map((o) => Number(o.total))),
          totalPayments: sumMoney(bPays.map((p) => Number(p.amount))),
        };
      });
    }

    return {
      range: { from: fromStr, to: toStr },
      branchId,
      financials: {
        orderCount: orders.length,
        totalRevenueBilled,
        totalPaymentsCollected,
        totalOutstanding,
        totalExpenses,
        netCashflow,
        paymentByMethod,
        expenseByCategory,
      },
      branchComparison,
    };
  }
}

@Controller('reports')
@Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  summary(
    @Query() query: ReportRangeQueryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.reportsService.summary(query, actor);
  }
}
