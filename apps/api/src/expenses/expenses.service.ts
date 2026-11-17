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

  listExpenses(query: ListExpensesQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const where: Record<string, unknown> = { tenantId: actor.tenantId };
    if (branchId) where.branchId = branchId;
    if (query.status) where.approvalStatus = query.status;

    return this.expensesRepo.find({
      where,
      relations: { category: true, branch: true, recordedBy: true },
      order: { expenseDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async createExpense(dto: CreateExpenseDto, actor: LaundryAuthUser) {
    const branchId = requireActorWriteBranch(actor, dto.branchId);
    const category = await this.categoriesRepo.findOne({
      where: { id: dto.categoryId, tenantId: actor.tenantId, isActive: true },
    });
    if (!category) throw new NotFoundException('Kategori pengeluaran tidak ditemukan');

    const autoApprove =
      actor.role === UserRole.SUPER_OWNER || actor.role === UserRole.BRANCH_OWNER;

    return this.expensesRepo.save(
      this.expensesRepo.create({
        tenantId: actor.tenantId,
        branchId,
        categoryId: category.id,
        recordedByStaffId: actor.id,
        description: dto.description,
        amount: dto.amount,
        expenseDate: dto.expenseDate,
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
  }

  async decideExpense(
    id: string,
    dto: DecideExpenseDto,
    actor: LaundryAuthUser,
  ) {
    const expense = await this.expensesRepo.findOne({
      where: { id, tenantId: actor.tenantId },
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
    expense.approvalNotes = dto.approvalNotes ?? null;
    return this.expensesRepo.save(expense);
  }
}
