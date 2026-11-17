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
import { ExpenseApprovalStatus, UserRole } from '../common/enums.js';
import {
  requireActorWriteBranch,
  resolveActorBranchScope,
} from '../common/utils/scope.js';
import { toSafeLikeContain } from '../common/utils/security.js';
import type {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  DecideExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense.dto.js';
import { ExpenseCategory } from './expense-category.entity.js';
import { Expense } from './expense.entity.js';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepo: Repository<ExpenseCategory>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
  ) {}

  private enrichExpense(e: Expense) {
    return Object.assign(e, {
      recordedById: e.recordedByStaffId,
      approvedById: e.approvedByStaffId,
      rejectionNote: e.approvalNotes ?? null,
    });
  }

  listCategories(tenantId: string) {
    return this.categoriesRepo.find({
      where: { tenantId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async createCategory(tenantId: string, dto: CreateExpenseCategoryDto) {
    const existing = await this.categoriesRepo.findOne({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Kategori pengeluaran sudah ada');
    }
    return this.categoriesRepo.save(
      this.categoriesRepo.create({
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        isActive: true,
      }),
    );
  }

  async updateCategory(
    id: string,
    tenantId: string,
    dto: UpdateExpenseCategoryDto,
  ) {
    const cat = await this.categoriesRepo.findOne({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan');
    Object.assign(cat, dto);
    return this.categoriesRepo.save(cat);
  }

  async listExpenses(query: ListExpensesQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.expensesRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.category', 'category')
      .leftJoinAndSelect('e.branch', 'branch')
      .leftJoinAndSelect('e.recordedBy', 'recordedBy')
      .leftJoinAndSelect('e.approvedBy', 'approvedBy')
      .where('e.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) qb.andWhere('e.branchId = :branchId', { branchId });
    if (query.categoryId) {
      qb.andWhere('e.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    const statusFilter = query.approvalStatus ?? query.status;
    if (statusFilter) {
      qb.andWhere('e.approvalStatus = :statusFilter', { statusFilter });
    }
    if (query.from) qb.andWhere('e.expenseDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('e.expenseDate <= :to', { to: query.to });
    if (query.q) {
      qb.andWhere(`e.description ILIKE :q ESCAPE '\\'`, {
        q: toSafeLikeContain(query.q),
      });
    }

    const [rawItems, total] = await qb
      .orderBy('e.expenseDate', 'DESC')
      .addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = rawItems.map((e) => this.enrichExpense(e));
    return { data, items: data, total, page, limit };
  }

  async createExpense(dto: CreateExpenseDto, actor: LaundryAuthUser) {
    const branchId = requireActorWriteBranch(actor, dto.branchId);
    const category = await this.categoriesRepo.findOne({
      where: { id: dto.categoryId, tenantId: actor.tenantId, isActive: true },
    });
    if (!category) throw new NotFoundException('Kategori pengeluaran tidak ditemukan');

    const autoApprove =
      actor.role === UserRole.SUPER_OWNER || actor.role === UserRole.BRANCH_OWNER;

    const saved = await this.expensesRepo.save(
      this.expensesRepo.create({
        tenantId: actor.tenantId,
        branchId,
        categoryId: category.id,
        recordedByStaffId: actor.id,
        description: dto.description,
        amount: dto.amount,
        expenseDate: dto.expenseDate || new Date().toISOString().slice(0, 10),
        paymentMethod: dto.paymentMethod,
        receiptUrl: dto.receiptUrl ?? null,
        notes: dto.notes ?? null,
        approvalStatus: autoApprove
          ? ExpenseApprovalStatus.APPROVED
          : ExpenseApprovalStatus.PENDING,
        approvedByStaffId: autoApprove ? actor.id : null,
        approvedAt: autoApprove ? new Date() : null,
      }),
    );
    return this.enrichExpense(saved);
  }

  async decideExpense(
    id: string,
    dto: DecideExpenseDto,
    actor: LaundryAuthUser,
  ) {
    const expense = await this.expensesRepo.findOne({
      where: { id, tenantId: actor.tenantId },
      relations: { category: true, branch: true, recordedBy: true, approvedBy: true },
    });
    if (!expense) throw new NotFoundException('Pengeluaran tidak ditemukan');
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      expense.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Akses cabang lain ditolak');
    }
    if (expense.approvalStatus !== ExpenseApprovalStatus.PENDING) {
      throw new BadRequestException('Pengeluaran ini sudah diproses sebelumnya');
    }

    expense.approvalStatus = dto.status;
    expense.approvedByStaffId = actor.id;
    expense.approvedAt = new Date();
    expense.approvalNotes = dto.rejectionNote ?? dto.approvalNotes ?? null;
    const saved = await this.expensesRepo.save(expense);
    return this.enrichExpense(saved);
  }
}
