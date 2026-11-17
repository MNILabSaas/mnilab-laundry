import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import {
  ExpenseApprovalStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '../common/enums.js';
import { subtractMoney, sumMoney } from '../common/utils/money.js';
import {
  requireActorWriteBranch,
  resolveActorBranchScope,
} from '../common/utils/scope.js';
import { Expense } from '../expenses/expense.entity.js';
import { Payment } from '../payments/payment.entity.js';
import { CashSettlement } from './cash-settlement.entity.js';
import type {
  DecideCashSettlementDto,
  ListCashSettlementsQueryDto,
  SubmitCashSettlementDto,
} from './dto/cash-settlement.dto.js';

@Injectable()
export class CashSettlementsService {
  constructor(
    @InjectRepository(CashSettlement)
    private readonly settlementsRepo: Repository<CashSettlement>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
  ) {}

  async computeDailyTotals(
    tenantId: string,
    branchId: string,
    dateStr: string,
  ) {
    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(`${dateStr}T23:59:59.999Z`);

    const payments = await this.paymentsRepo
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.branchId = :branchId', { branchId })
      .andWhere('p.status = :status', { status: PaymentStatus.SUCCESS })
      .andWhere('p.paidAt BETWEEN :start AND :end', { start, end })
      .getMany();

    const approvedExpenses = await this.expensesRepo.find({
      where: {
        tenantId,
        branchId,
        expenseDate: dateStr,
        approvalStatus: ExpenseApprovalStatus.APPROVED,
        paymentMethod: PaymentMethod.CASH,
      },
    });

    const totalCashIn = sumMoney(
      payments
        .filter((p) => p.method === PaymentMethod.CASH)
        .map((p) => Number(p.amount)),
    );
    const totalQrisIn = sumMoney(
      payments
        .filter((p) => p.method === PaymentMethod.QRIS)
        .map((p) => Number(p.amount)),
    );
    const totalApprovedExpense = sumMoney(
      approvedExpenses.map((e) => Number(e.amount)),
    );
    const expectedCash = subtractMoney(totalCashIn, totalApprovedExpense);

    return {
      totalCashIn,
      totalQrisIn,
      totalApprovedExpense,
      expectedCash,
    };
  }

  async submit(dto: SubmitCashSettlementDto, actor: LaundryAuthUser) {
    const branchId = requireActorWriteBranch(actor, dto.branchId);
    const existing = await this.settlementsRepo.findOne({
      where: {
        tenantId: actor.tenantId,
        branchId,
        settlementDate: dto.settlementDate,
      },
    });
    if (existing && existing.status === ExpenseApprovalStatus.APPROVED) {
      throw new ConflictException('Setoran kas tanggal ini sudah disetujui');
    }

    const totals = await this.computeDailyTotals(
      actor.tenantId,
      branchId,
      dto.settlementDate,
    );
    const difference = subtractMoney(dto.actualCash, totals.expectedCash);

    if (existing) {
      existing.cashierStaffId = actor.id;
      existing.totalCashIn = totals.totalCashIn;
      existing.totalQrisIn = totals.totalQrisIn;
      existing.totalApprovedExpense = totals.totalApprovedExpense;
      existing.expectedCash = totals.expectedCash;
      existing.actualCash = dto.actualCash;
      existing.difference = difference;
      existing.status = ExpenseApprovalStatus.PENDING;
      existing.cashierNotes = dto.cashierNotes ?? null;
      return this.settlementsRepo.save(existing);
    }

    return this.settlementsRepo.save(
      this.settlementsRepo.create({
        tenantId: actor.tenantId,
        branchId,
        settlementDate: dto.settlementDate,
        cashierStaffId: actor.id,
        ...totals,
        actualCash: dto.actualCash,
        difference,
        status: ExpenseApprovalStatus.PENDING,
        cashierNotes: dto.cashierNotes ?? null,
      }),
    );
  }

  async getByDate(
    date: string,
    branchIdParam: string | undefined,
    actor: LaundryAuthUser,
  ) {
    const branchId = requireActorWriteBranch(actor, branchIdParam);
    const [existing, totals] = await Promise.all([
      this.settlementsRepo.findOne({
        where: { tenantId: actor.tenantId, branchId, settlementDate: date },
        relations: { branch: true, cashier: true },
      }),
      this.computeDailyTotals(actor.tenantId, branchId, date),
    ]);
    return { date, branchId, preview: totals, settlement: existing };
  }

  list(query: ListCashSettlementsQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const where: Record<string, unknown> = { tenantId: actor.tenantId };
    if (branchId) where.branchId = branchId;
    return this.settlementsRepo.find({
      where,
      relations: { branch: true, cashier: true },
      order: { settlementDate: 'DESC' },
    });
  }

  async decide(
    id: string,
    dto: DecideCashSettlementDto,
    actor: LaundryAuthUser,
  ) {
    const item = await this.settlementsRepo.findOne({
      where: { id, tenantId: actor.tenantId },
    });
    if (!item) throw new NotFoundException('Setoran kas tidak ditemukan');
    if (actor.role !== UserRole.SUPER_OWNER && item.branchId !== actor.branchId) {
      throw new ForbiddenException('Akses cabang lain ditolak');
    }
    if (item.status !== ExpenseApprovalStatus.PENDING) {
      throw new BadRequestException('Setoran kas ini sudah diproses');
    }
    item.status = dto.status;
    item.reviewedByStaffId = actor.id;
    item.reviewedAt = new Date();
    item.reviewNotes = dto.reviewNotes ?? null;
    return this.settlementsRepo.save(item);
  }
}
