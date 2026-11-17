import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import {
  ExpenseApprovalStatus,
  ItemStatus,
  PaymentMethod,
  UserRole,
} from '../common/enums.js';
import { multiplyMoney, sumMoney } from '../common/utils/money.js';
import {
  requireActorWriteBranch,
  resolveActorBranchScope,
} from '../common/utils/scope.js';
import { toSafeLikeContain } from '../common/utils/security.js';
import { ExpenseCategory } from '../expenses/expense-category.entity.js';
import { Expense } from '../expenses/expense.entity.js';
import { LaundryOrderItem } from '../orders/laundry-order-item.entity.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import type {
  ApproveIroningPayoutDto,
  AssignRackDto,
  IroningEarningsQueryDto,
  ListIroningPayoutsQueryDto,
  QueueQueryDto,
  RejectIroningPayoutDto,
  RequestIroningPayoutDto,
  TransitionItemStatusDto,
} from './dto/workflow.dto.js';
import { IroningPayout } from './ironing-payout.entity.js';
import { OrderStatusHistory } from './order-status-history.entity.js';
import {
  completionStatuses,
  ironingPickupStatuses,
  TransitionAction,
} from './workflow.config.js';
import { assertCanAssignRack, assertTransition } from './workflow.policy.js';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(LaundryOrderItem)
    private readonly itemsRepo: Repository<LaundryOrderItem>,
    @InjectRepository(OrderStatusHistory)
    private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(IroningPayout)
    private readonly payoutsRepo: Repository<IroningPayout>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(LaundryStaff)
    private readonly staffRepo: Repository<LaundryStaff>,
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepo: Repository<ExpenseCategory>,
  ) {}

  private enrichItem(item: LaundryOrderItem, canCompleteNow?: boolean) {
    return Object.assign(item, {
      ironingEmployee: item.ironingStaff ?? null,
      ironingEmployeeId: item.ironingStaffId ?? null,
      ...(canCompleteNow !== undefined ? { canCompleteNow } : {}),
    });
  }

  async getItem(id: string, actor: LaundryAuthUser) {
    const item = await this.itemsRepo.findOne({
      where: { id, tenantId: actor.tenantId },
      relations: { order: { branch: true, customer: true }, ironingStaff: true },
    });
    if (!item) throw new NotFoundException('Item order tidak ditemukan');
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      item.order.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Anda tidak memiliki akses ke item cabang lain');
    }
    return this.enrichItem(item);
  }

  async getItemHistory(id: string, actor: LaundryAuthUser) {
    await this.getItem(id, actor);
    return this.historyRepo.find({
      where: { orderItemId: id, tenantId: actor.tenantId },
      relations: { changedBy: true },
      order: { createdAt: 'ASC' },
    });
  }

  async listIroningQueue(actor: LaundryAuthUser, query: QueueQueryDto) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const pickupPairs = ironingPickupStatuses();

    const qb = this.itemsRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.order', 'o')
      .innerJoinAndSelect('o.branch', 'b')
      .innerJoinAndSelect('o.customer', 'c')
      .leftJoinAndSelect('i.ironingStaff', 'staff')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) {
      qb.andWhere('o.branchId = :branchId', { branchId });
    }
    if (query.mineOnly && actor.role === UserRole.IRONING) {
      qb.andWhere('i.ironingStaffId = :empId', { empId: actor.id });
    }
    if (query.q) {
      const q = toSafeLikeContain(query.q);
      qb.andWhere(
        new Brackets((w) =>
          w
            .where(`o.orderNumber ILIKE :q ESCAPE '\\'`, { q })
            .orWhere(`c.name ILIKE :q ESCAPE '\\'`, { q })
            .orWhere(`i.serviceName ILIKE :q ESCAPE '\\'`, { q }),
        ),
      );
    }

    const pairClauses = pickupPairs.map(
      (_, idx) => `(i.workflow = :wf${idx} AND i.status = :st${idx})`,
    );
    const pairParams: Record<string, string> = {};
    pickupPairs.forEach((p, idx) => {
      pairParams[`wf${idx}`] = p.workflow;
      pairParams[`st${idx}`] = p.status;
    });

    qb.andWhere(
      `((${pairClauses.join(' OR ')}) OR i.status = :inProgress)`,
      { ...pairParams, inProgress: ItemStatus.PROSES_SETRIKA },
    );

    const list = await qb.orderBy('o.receivedAt', 'ASC').getMany();
    return list.map((item) => this.enrichItem(item));
  }

  async listWashingQueue(actor: LaundryAuthUser, query: QueueQueryDto) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const readyPairs = completionStatuses();

    const qb = this.itemsRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.order', 'o')
      .innerJoinAndSelect('o.branch', 'b')
      .innerJoinAndSelect('o.customer', 'c')
      .leftJoinAndSelect('i.ironingStaff', 'staff')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('i.status <> :done', { done: ItemStatus.SELESAI });

    if (branchId) {
      qb.andWhere('o.branchId = :branchId', { branchId });
    }
    if (query.q) {
      const q = toSafeLikeContain(query.q);
      qb.andWhere(
        new Brackets((w) =>
          w
            .where(`o.orderNumber ILIKE :q ESCAPE '\\'`, { q })
            .orWhere(`c.name ILIKE :q ESCAPE '\\'`, { q })
            .orWhere(`i.serviceName ILIKE :q ESCAPE '\\'`, { q }),
        ),
      );
    }

    const list = await qb.orderBy('o.receivedAt', 'ASC').getMany();
    return list.map((item) => {
      const canCompleteNow = readyPairs.some(
        (p) => p.workflow === item.workflow && p.status === item.status,
      );
      return this.enrichItem(item, canCompleteNow);
    });
  }

  async transitionStatus(
    id: string,
    dto: TransitionItemStatusDto,
    actor: LaundryAuthUser,
  ) {
    const targetStatus = dto.toStatus ?? dto.targetStatus;
    if (!targetStatus) {
      throw new BadRequestException('Status tujuan (toStatus) wajib diisi');
    }

    await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(LaundryOrderItem, {
        where: { id, tenantId: actor.tenantId },
        relations: { order: { branch: true } },
      });
      if (!item) throw new NotFoundException('Item order tidak ditemukan');
      if (
        actor.role !== UserRole.SUPER_OWNER &&
        item.order.branchId !== actor.branchId
      ) {
        throw new ForbiddenException('Akses item cabang lain ditolak');
      }

      const effectiveRack = dto.rackNumber ?? item.rackNumber;
      const transition = assertTransition({
        workflow: item.workflow,
        currentStatus: item.status,
        targetStatus,
        actorRole: actor.role,
        actorId: actor.id,
        ironingStaffId: item.ironingStaffId,
        rackNumber: effectiveRack,
      });

      const fromStatus = item.status;
      const now = new Date();
      item.status = targetStatus;

      if (transition.action === TransitionAction.START_IRONING) {
        if (item.ironingStaffId && item.ironingStaffId !== actor.id) {
          throw new ConflictException(
            'Pekerjaan ini sudah diambil oleh pegawai setrika lain',
          );
        }
        item.ironingStaffId = actor.id;
        item.ironingStartedAt = now;
      } else if (transition.action === TransitionAction.FINISH_IRONING) {
        if (!item.ironingStaffId) item.ironingStaffId = actor.id;
        const rate = Number(item.order.branch.ironingRate || 1100);
        const weight =
          item.weightKg && Number(item.weightKg) > 0
            ? Number(item.weightKg)
            : Number(item.quantity) > 0
              ? Number(item.quantity)
              : 1;
        item.ironingCompletedAt = now;
        item.ironingRate = rate;
        item.ironingWage = multiplyMoney(weight, rate);
      } else if (transition.action === TransitionAction.COMPLETE) {
        if (effectiveRack) {
          item.rackNumber = effectiveRack.trim().toUpperCase();
          item.rackAssignedByStaffId = item.rackAssignedByStaffId ?? actor.id;
          item.rackAssignedAt = item.rackAssignedAt ?? now;
        }
        item.completedAt = now;
      }

      await manager.save(item);
      await manager.save(
        manager.create(OrderStatusHistory, {
          tenantId: actor.tenantId,
          orderItemId: item.id,
          fromStatus,
          toStatus: targetStatus,
          changedByStaffId: actor.id,
          notes:
            dto.notes ??
            (transition.action === TransitionAction.COMPLETE
              ? `Diselesaikan di Rak ${item.rackNumber}`
              : null),
        }),
      );
    });

    return this.getItem(id, actor);
  }

  async assignRack(id: string, dto: AssignRackDto, actor: LaundryAuthUser) {
    const markCompleted = dto.markCompleted ?? true;
    await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(LaundryOrderItem, {
        where: { id, tenantId: actor.tenantId },
        relations: { order: { branch: true } },
      });
      if (!item) throw new NotFoundException('Item order tidak ditemukan');
      if (
        actor.role !== UserRole.SUPER_OWNER &&
        item.order.branchId !== actor.branchId
      ) {
        throw new ForbiddenException('Akses item cabang lain ditolak');
      }

      assertCanAssignRack(item.workflow, item.status, actor.role);
      const now = new Date();
      const rack = dto.rackNumber.trim().toUpperCase();
      item.rackNumber = rack;
      item.rackAssignedByStaffId = actor.id;
      item.rackAssignedAt = now;

      if (markCompleted && item.status !== ItemStatus.SELESAI) {
        assertTransition({
          workflow: item.workflow,
          currentStatus: item.status,
          targetStatus: ItemStatus.SELESAI,
          actorRole: actor.role,
          actorId: actor.id,
          ironingStaffId: item.ironingStaffId,
          rackNumber: rack,
        });
        const prev = item.status;
        item.status = ItemStatus.SELESAI;
        item.completedAt = now;
        await manager.save(item);
        await manager.save(
          manager.create(OrderStatusHistory, {
            tenantId: actor.tenantId,
            orderItemId: item.id,
            fromStatus: prev,
            toStatus: ItemStatus.SELESAI,
            changedByStaffId: actor.id,
            notes: dto.notes || `Nomor rak ${rack} diinput & cucian selesai`,
          }),
        );
      } else {
        await manager.save(item);
      }
    });

    return this.getItem(id, actor);
  }

  async getIroningEarnings(
    actor: LaundryAuthUser,
    query: IroningEarningsQueryDto,
  ) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();

    let targetEmployeeId = actor.id;
    if (
      (actor.role === UserRole.SUPER_OWNER ||
        actor.role === UserRole.BRANCH_OWNER) &&
      query.employeeId
    ) {
      targetEmployeeId = query.employeeId;
    }

    const qb = this.itemsRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.order', 'o')
      .innerJoinAndSelect('o.customer', 'c')
      .leftJoinAndSelect('i.ironingStaff', 'staff')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('i.ironingCompletedAt IS NOT NULL')
      .andWhere('EXTRACT(MONTH FROM i.ironingCompletedAt) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM i.ironingCompletedAt) = :year', { year })
      .andWhere('i.ironingStaffId = :staffId', { staffId: targetEmployeeId });

    if (branchId) qb.andWhere('o.branchId = :branchId', { branchId });

    const items = await qb.orderBy('i.ironingCompletedAt', 'DESC').getMany();

    const formattedItems = items.map((item) => {
      const rate = Number(item.ironingRate ?? 1100);
      const weight =
        item.weightKg && Number(item.weightKg) > 0
          ? Number(item.weightKg)
          : Number(item.quantity) > 0
            ? Number(item.quantity)
            : 1;
      const wage = Number(item.ironingWage ?? Math.round(weight * rate));
      const isPaid = Boolean(item.ironingPaidAt);
      const isPending = Boolean(item.ironingPayoutId && !item.ironingPaidAt);
      const isUnpaid = !item.ironingPayoutId && !item.ironingPaidAt;
      return {
        id: item.id,
        orderId: item.orderId,
        orderNumber: item.order.orderNumber,
        customerName: item.order.customer?.name || 'Customer',
        customerPhone: item.order.customer?.phone || null,
        serviceName: item.serviceName,
        completedAt: item.ironingCompletedAt,
        weightKg: item.weightKg,
        quantity: item.quantity,
        ironingRate: rate,
        ironingWage: wage,
        ironingPayoutId: item.ironingPayoutId,
        ironingPaidAt: item.ironingPaidAt,
        isPaid,
        isPending,
        isUnpaid,
      };
    });

    const monthTotalEarnings = sumMoney(formattedItems.map((i) => i.ironingWage));
    const paidEarnings = sumMoney(
      formattedItems.filter((i) => i.isPaid).map((i) => i.ironingWage),
    );
    const pendingEarnings = sumMoney(
      formattedItems.filter((i) => i.isPending).map((i) => i.ironingWage),
    );
    const unpaidEarnings = sumMoney(
      formattedItems.filter((i) => i.isUnpaid).map((i) => i.ironingWage),
    );

    const totalWeightKg = formattedItems.reduce((acc, curr) => {
      const w =
        curr.weightKg && Number(curr.weightKg) > 0
          ? Number(curr.weightKg)
          : Number(curr.quantity) > 0
            ? Number(curr.quantity)
            : 0;
      return acc + w;
    }, 0);

    const employee = await this.staffRepo.findOne({
      where: { id: targetEmployeeId, tenantId: actor.tenantId },
      relations: { branch: true },
    });

    const latestPayout = await this.payoutsRepo.findOne({
      where: {
        tenantId: actor.tenantId,
        employeeStaffId: targetEmployeeId,
        periodMonth: month,
        periodYear: year,
      },
      relations: { paidBy: true },
      order: { createdAt: 'DESC' },
    });

    const pendingPayout = await this.payoutsRepo.findOne({
      where: {
        tenantId: actor.tenantId,
        employeeStaffId: targetEmployeeId,
        status: ExpenseApprovalStatus.PENDING,
      },
      relations: { paidBy: true },
      order: { createdAt: 'DESC' },
    });

    const activePayout = pendingPayout || latestPayout;

    return {
      month,
      year,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            phone: employee.phone,
            branchName: employee.branch?.name || null,
            branchCode: employee.branch?.code || null,
          }
        : null,
      totalEarnings: unpaidEarnings,
      unpaidEarnings,
      monthTotalEarnings,
      paidEarnings,
      pendingEarnings,
      unpaidAmount: unpaidEarnings,
      paidAmount: paidEarnings,
      totalAmount: monthTotalEarnings,
      totalItems: formattedItems.length,
      totalWeightKg: Math.round(totalWeightKg * 100) / 100,
      unpaidItemsCount: formattedItems.filter((i) => i.isUnpaid).length,
      paidItemsCount: formattedItems.filter((i) => i.isPaid).length,
      canRequestPayout: unpaidEarnings > 0 && !pendingPayout,
      payoutStatus: pendingPayout
        ? 'PENDING'
        : unpaidEarnings === 0 && monthTotalEarnings > 0
          ? 'PAID'
          : 'UNPAID',
      latestPayout: activePayout
        ? {
            id: activePayout.id,
            status: activePayout.status,
            amount: activePayout.amount,
            totalItems: activePayout.totalItems,
            periodMonth: activePayout.periodMonth,
            periodYear: activePayout.periodYear,
            employeeNotes: activePayout.employeeNotes,
            transferProof: activePayout.transferProof,
            paymentNotes: activePayout.paymentNotes,
            paidAt: activePayout.paidAt,
            paidByName: activePayout.paidBy?.name || null,
            rejectionReason: activePayout.rejectionReason,
            createdAt: activePayout.createdAt,
          }
        : null,
      items: formattedItems,
    };
  }

  async getIroningHistory(
    actor: LaundryAuthUser,
    query: IroningEarningsQueryDto,
  ) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.itemsRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.order', 'o')
      .innerJoinAndSelect('o.customer', 'c')
      .innerJoinAndSelect('o.branch', 'b')
      .leftJoinAndSelect('i.ironingStaff', 'staff')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('i.ironingStaffId IS NOT NULL');

    if (branchId) qb.andWhere('o.branchId = :branchId', { branchId });
    if (actor.role === UserRole.IRONING) {
      qb.andWhere('i.ironingStaffId = :staffId', { staffId: actor.id });
    } else if (query.employeeId) {
      qb.andWhere('i.ironingStaffId = :staffId', {
        staffId: query.employeeId,
      });
    }
    if (query.month && query.year) {
      qb.andWhere('EXTRACT(MONTH FROM i.ironingCompletedAt) = :month', {
        month: query.month,
      }).andWhere('EXTRACT(YEAR FROM i.ironingCompletedAt) = :year', {
        year: query.year,
      });
    }
    if (query.from) {
      qb.andWhere('(i.ironingStartedAt >= :from OR i.createdAt >= :from)', {
        from: `${query.from}T00:00:00+07:00`,
      });
    }
    if (query.to) {
      qb.andWhere('(i.ironingStartedAt <= :to OR i.createdAt <= :to)', {
        to: `${query.to}T23:59:59.999+07:00`,
      });
    }
    if (query.q) {
      const q = toSafeLikeContain(query.q);
      qb.andWhere(
        new Brackets((w) =>
          w
            .where(`o.orderNumber ILIKE :q ESCAPE '\\'`, { q })
            .orWhere(`c.name ILIKE :q ESCAPE '\\'`, { q })
            .orWhere(`c.phone ILIKE :q ESCAPE '\\'`, { q })
            .orWhere(`i.serviceName ILIKE :q ESCAPE '\\'`, { q }),
        ),
      );
    }

    const [rawItems, total] = await qb
      .orderBy('i.ironingStartedAt', 'DESC')
      .addOrderBy('i.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = rawItems.map((item) => {
      const rate = Number(item.ironingRate ?? 1100);
      const weight =
        item.weightKg && Number(item.weightKg) > 0
          ? Number(item.weightKg)
          : Number(item.quantity) > 0
            ? Number(item.quantity)
            : 1;
      const wage = Number(
        item.ironingWage ?? (item.ironingCompletedAt ? Math.round(weight * rate) : 0),
      );
      return {
        id: item.id,
        orderId: item.orderId,
        orderNumber: item.order.orderNumber,
        customerName: item.order.customer?.name || 'Customer',
        customerPhone: item.order.customer?.phone || null,
        serviceName: item.serviceName,
        status: item.status,
        startedAt: item.ironingStartedAt,
        completedAt: item.ironingCompletedAt,
        weightKg: item.weightKg,
        quantity: item.quantity,
        ironingRate: rate,
        ironingWage: wage,
        ironingEmployeeName: item.ironingStaff?.name || null,
      };
    });

    return { data, items: data, total, page, limit };
  }

  async requestIroningPayout(
    actor: LaundryAuthUser,
    dto: RequestIroningPayoutDto,
  ) {
    const now = new Date();
    const month = dto.month ?? now.getMonth() + 1;
    const year = dto.year ?? now.getFullYear();

    const existingPending = await this.payoutsRepo.findOne({
      where: {
        tenantId: actor.tenantId,
        employeeStaffId: actor.id,
        status: ExpenseApprovalStatus.PENDING,
      },
    });
    if (existingPending) {
      throw new ConflictException(
        'Anda masih memiliki pengajuan pencairan upah berstatus Menunggu (PENDING). Harap tunggu hingga owner memprosesnya.',
      );
    }

    let branchId = actor.branchId;
    if (!branchId) {
      const mainBranch = await this.branchesRepo.findOne({
        where: { tenantId: actor.tenantId, isActive: true },
        order: { isMain: 'DESC', createdAt: 'ASC' },
      });
      branchId = mainBranch?.id ?? null;
    }
    if (!branchId) {
      branchId = requireActorWriteBranch(actor);
    }

    const items = await this.itemsRepo
      .createQueryBuilder('i')
      .innerJoin('i.order', 'o')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('i.ironingStaffId = :staffId', { staffId: actor.id })
      .andWhere('i.ironingCompletedAt IS NOT NULL')
      .andWhere('i.ironingPayoutId IS NULL')
      .andWhere('i.ironingPaidAt IS NULL')
      .andWhere('EXTRACT(MONTH FROM i.ironingCompletedAt) = :month', {
        month,
      })
      .andWhere('EXTRACT(YEAR FROM i.ironingCompletedAt) = :year', {
        year,
      })
      .getMany();

    if (items.length === 0) {
      throw new BadRequestException(
        'Tidak ada upah setrika yang belum dibayar pada periode tersebut',
      );
    }

    const amount = sumMoney(items.map((i) => Number(i.ironingWage || 0)));
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(IroningPayout, {
          tenantId: actor.tenantId,
          branchId,
          employeeStaffId: actor.id,
          periodMonth: month,
          periodYear: year,
          amount,
          totalItems: items.length,
          status: ExpenseApprovalStatus.PENDING,
          employeeNotes: dto.employeeNotes ?? null,
        }),
      );

      for (const item of items) {
        item.ironingPayoutId = saved.id;
        await manager.save(item);
      }

      return saved;
    });
  }

  async listIroningPayouts(
    actor: LaundryAuthUser,
    query: ListIroningPayoutsQueryDto,
  ) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.payoutsRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.employee', 'employee')
      .leftJoinAndSelect('p.branch', 'branch')
      .leftJoinAndSelect('p.paidBy', 'paidBy')
      .where('p.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) qb.andWhere('p.branchId = :branchId', { branchId });
    if (actor.role === UserRole.IRONING) {
      qb.andWhere('p.employeeStaffId = :empId', { empId: actor.id });
    } else if (query.employeeId) {
      qb.andWhere('p.employeeStaffId = :empId', { empId: query.employeeId });
    }
    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    if (query.month) qb.andWhere('p.periodMonth = :month', { month: query.month });
    if (query.year) qb.andWhere('p.periodYear = :year', { year: query.year });

    const [rawItems, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = rawItems.map((p) =>
      Object.assign(p, {
        employeeId: p.employeeStaffId,
        paidById: p.paidByStaffId,
        rejectedById: p.rejectedByStaffId,
      }),
    );

    return { data, items: data, total, page, limit };
  }

  async getIroningPayoutDetail(id: string, actor: LaundryAuthUser) {
    const payout = await this.payoutsRepo.findOne({
      where: { id, tenantId: actor.tenantId },
      relations: { employee: true, branch: true, paidBy: true, rejectedBy: true },
    });
    if (!payout) throw new NotFoundException('Pengajuan upah tidak ditemukan');
    if (
      actor.role === UserRole.IRONING &&
      payout.employeeStaffId !== actor.id
    ) {
      throw new ForbiddenException('Akses ditolak');
    }
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      payout.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Akses cabang lain ditolak');
    }

    const items = await this.itemsRepo.find({
      where: { tenantId: actor.tenantId, ironingPayoutId: id },
      relations: { order: { customer: true } },
      order: { ironingCompletedAt: 'DESC' },
    });

    return Object.assign(payout, {
      employeeId: payout.employeeStaffId,
      items: items.map((it) => ({
        id: it.id,
        orderNumber: it.order?.orderNumber,
        customerName: it.order?.customer?.name || 'Customer',
        serviceName: it.serviceName,
        completedAt: it.ironingCompletedAt,
        weightKg: it.weightKg,
        quantity: it.quantity,
        ironingRate: it.ironingRate,
        ironingWage: it.ironingWage,
      })),
    });
  }

  async payIroningPayout(
    id: string,
    dto: ApproveIroningPayoutDto,
    actor: LaundryAuthUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const payout = await manager.findOne(IroningPayout, {
        where: { id, tenantId: actor.tenantId },
        relations: { employee: true, branch: true },
      });
      if (!payout) throw new NotFoundException('Pengajuan upah tidak ditemukan');
      if (
        actor.role !== UserRole.SUPER_OWNER &&
        payout.branchId !== actor.branchId
      ) {
        throw new ForbiddenException('Akses cabang lain ditolak');
      }
      if (payout.status !== ExpenseApprovalStatus.PENDING) {
        throw new BadRequestException('Pengajuan ini sudah diproses sebelumnya');
      }

      const now = new Date();
      const unpaidItems = await manager
        .createQueryBuilder(LaundryOrderItem, 'i')
        .innerJoin('i.order', 'o')
        .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
        .andWhere(
          '(i.ironingPayoutId = :payoutId OR (o.branchId = :branchId AND i.ironingStaffId = :staffId AND i.ironingCompletedAt IS NOT NULL AND i.ironingPaidAt IS NULL AND EXTRACT(MONTH FROM i.ironingCompletedAt) = :month AND EXTRACT(YEAR FROM i.ironingCompletedAt) = :year))',
          {
            payoutId: payout.id,
            branchId: payout.branchId,
            staffId: payout.employeeStaffId,
            month: payout.periodMonth,
            year: payout.periodYear,
          },
        )
        .getMany();

      for (const item of unpaidItems) {
        item.ironingPayoutId = payout.id;
        item.ironingPaidAt = now;
        await manager.save(item);
      }

      payout.status = ExpenseApprovalStatus.APPROVED;
      payout.transferProof = dto.transferProof ?? null;
      payout.paymentNotes = dto.paymentNotes ?? null;
      payout.paidByStaffId = actor.id;
      payout.paidAt = now;
      await manager.save(payout);

      let upahCategory = await manager.findOne(ExpenseCategory, {
        where: {
          tenantId: actor.tenantId,
          name: 'Beban Gaji & Upah Pegawai',
        },
      });
      if (!upahCategory) {
        upahCategory = await manager.save(
          manager.create(ExpenseCategory, {
            tenantId: actor.tenantId,
            name: 'Beban Gaji & Upah Pegawai',
            description: 'Beban komisi upah setrika dan gaji karyawan',
            isActive: true,
          }),
        );
      }

      await manager.save(
        manager.create(Expense, {
          tenantId: actor.tenantId,
          branchId: payout.branchId,
          categoryId: upahCategory.id,
          recordedByStaffId: actor.id,
          approvedByStaffId: actor.id,
          approvedAt: now,
          description: `Upah Setrika - ${payout.employee?.name || 'Pegawai Setrika'} (${payout.totalItems} cucian)`,
          amount: payout.amount,
          expenseDate: now.toISOString().slice(0, 10),
          paymentMethod: PaymentMethod.TRANSFER,
          receiptUrl: payout.transferProof ?? null,
          notes: `Pencairan upah setrika periode ${payout.periodMonth}/${payout.periodYear}. Ref: ${payout.paymentNotes || '-'}`,
          approvalStatus: ExpenseApprovalStatus.APPROVED,
        }),
      );

      return payout;
    });
  }

  async rejectIroningPayout(
    id: string,
    dto: RejectIroningPayoutDto,
    actor: LaundryAuthUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const payout = await manager.findOne(IroningPayout, {
        where: { id, tenantId: actor.tenantId },
      });
      if (!payout) throw new NotFoundException('Pengajuan upah tidak ditemukan');
      if (
        actor.role !== UserRole.SUPER_OWNER &&
        payout.branchId !== actor.branchId
      ) {
        throw new ForbiddenException('Akses cabang lain ditolak');
      }
      if (payout.status !== ExpenseApprovalStatus.PENDING) {
        throw new BadRequestException('Pengajuan ini sudah diproses sebelumnya');
      }

      payout.status = ExpenseApprovalStatus.REJECTED;
      payout.rejectedByStaffId = actor.id;
      payout.rejectedAt = new Date();
      payout.rejectionReason = dto.rejectionReason;
      await manager.save(payout);

      const items = await manager.find(LaundryOrderItem, {
        where: { tenantId: actor.tenantId, ironingPayoutId: payout.id },
      });
      for (const item of items) {
        item.ironingPayoutId = null;
        await manager.save(item);
      }

      return payout;
    });
  }
}
