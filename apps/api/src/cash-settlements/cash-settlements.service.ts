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

  private enrichSettlement(s: CashSettlement) {
    return Object.assign(s, {
      cashierId: s.cashierStaffId,
      reviewedById: s.reviewedByStaffId,
    });
  }

  async computeDailyTotals(
    tenantId: string,
    branchId: string,
    dateStr: string,
  ) {
    const start = new Date(`${dateStr}T00:00:00+07:00`);
    const end = new Date(`${dateStr}T23:59:59.999+07:00`);

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
      existing.reviewedByStaffId = null;
      existing.reviewedAt = null;
      existing.reviewNotes = null;
      const saved = await this.settlementsRepo.save(existing);
      return this.enrichSettlement(saved);
    }

    const saved = await this.settlementsRepo.save(
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
    return this.enrichSettlement(saved);
  }

  async getByDate(
    date: string,
    branchIdParam: string | undefined,
    actor: LaundryAuthUser,
  ) {
    const branchId = resolveActorBranchScope(actor, branchIdParam);
    if (!branchId) return null;
    const existing = await this.settlementsRepo.findOne({
      where: { tenantId: actor.tenantId, branchId, settlementDate: date },
      relations: { branch: true, cashier: true, reviewedBy: true },
    });
    if (!existing) return null;
    return this.enrichSettlement(existing);
  }

  async list(query: ListCashSettlementsQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.settlementsRepo
      .createQueryBuilder('cs')
      .leftJoinAndSelect('cs.branch', 'branch')
      .leftJoinAndSelect('cs.cashier', 'cashier')
      .leftJoinAndSelect('cs.reviewedBy', 'reviewedBy')
      .where('cs.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) qb.andWhere('cs.branchId = :branchId', { branchId });
    if (query.status) qb.andWhere('cs.status = :status', { status: query.status });
    if (query.date) qb.andWhere('cs.settlementDate = :date', { date: query.date });
    if (query.from) qb.andWhere('cs.settlementDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('cs.settlementDate <= :to', { to: query.to });

    const [rawItems, total] = await qb
      .orderBy('cs.settlementDate', 'DESC')
      .addOrderBy('cs.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = rawItems.map((s) => this.enrichSettlement(s));
    return { data, items: data, total, page, limit };
  }

  async decide(
    id: string,
    dto: DecideCashSettlementDto,
    actor: LaundryAuthUser,
  ) {
    const item = await this.settlementsRepo.findOne({
      where: { id, tenantId: actor.tenantId },
      relations: { branch: true, cashier: true, reviewedBy: true },
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
    const saved = await this.settlementsRepo.save(item);
    return this.enrichSettlement(saved);
  }
}
