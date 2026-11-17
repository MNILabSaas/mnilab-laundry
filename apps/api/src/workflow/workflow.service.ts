import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import {
  ExpenseApprovalStatus,
  ItemStatus,
  UserRole,
} from '../common/enums.js';
import { multiplyMoney, sumMoney } from '../common/utils/money.js';
import {
  requireActorWriteBranch,
  resolveActorBranchScope,
} from '../common/utils/scope.js';
import { LaundryOrderItem } from '../orders/laundry-order-item.entity.js';
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
  ) {}

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
    return item;
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

    return qb.orderBy('o.receivedAt', 'ASC').getMany();
  }

  async listWashingQueue(actor: LaundryAuthUser, query: QueueQueryDto) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const donePairs = completionStatuses();

    const qb = this.itemsRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.order', 'o')
      .innerJoinAndSelect('o.branch', 'b')
      .innerJoinAndSelect('o.customer', 'c')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) {
      qb.andWhere('o.branchId = :branchId', { branchId });
    }

    const pairClauses = donePairs.map(
      (_, idx) => `(i.workflow = :wf${idx} AND i.status = :st${idx})`,
    );
    const pairParams: Record<string, string> = {};
    donePairs.forEach((p, idx) => {
      pairParams[`wf${idx}`] = p.workflow;
      pairParams[`st${idx}`] = p.status;
    });

    qb.andWhere(`(${pairClauses.join(' OR ')})`, pairParams);
    return qb.orderBy('o.receivedAt', 'ASC').getMany();
  }

  async transitionStatus(
    id: string,
    dto: TransitionItemStatusDto,
    actor: LaundryAuthUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
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
        targetStatus: dto.targetStatus,
        actorRole: actor.role,
        actorId: actor.id,
        ironingStaffId: item.ironingStaffId,
        rackNumber: effectiveRack,
      });

      const fromStatus = item.status;
      const now = new Date();
      item.status = dto.targetStatus;

      if (transition.action === TransitionAction.START_IRONING) {
        item.ironingStaffId = actor.id;
        item.ironingStartedAt = now;
      } else if (transition.action === TransitionAction.FINISH_IRONING) {
        const rate = Number(item.order.branch.ironingRate || 0);
        item.ironingCompletedAt = now;
        item.ironingRate = rate;
        item.ironingWage = multiplyMoney(Number(item.quantity), rate);
      } else if (transition.action === TransitionAction.COMPLETE) {
        item.rackNumber = effectiveRack!;
        item.rackAssignedByStaffId = item.rackAssignedByStaffId ?? actor.id;
        item.rackAssignedAt = item.rackAssignedAt ?? now;
        item.completedAt = now;
      }

      const saved = await manager.save(item);
      await manager.save(
        manager.create(OrderStatusHistory, {
          tenantId: actor.tenantId,
          orderItemId: item.id,
          fromStatus,
          toStatus: dto.targetStatus,
          changedByStaffId: actor.id,
          notes: dto.notes ?? null,
        }),
      );
      return saved;
    });
  }

  async assignRack(id: string, dto: AssignRackDto, actor: LaundryAuthUser) {
    const item = await this.getItem(id, actor);
    assertCanAssignRack(item.workflow, item.status, actor.role);
    item.rackNumber = dto.rackNumber;
    item.rackAssignedByStaffId = actor.id;
    item.rackAssignedAt = new Date();
    return this.itemsRepo.save(item);
  }

  async getIroningEarnings(
    actor: LaundryAuthUser,
    query: IroningEarningsQueryDto,
  ) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();

    const qb = this.itemsRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.order', 'o')
      .innerJoinAndSelect('i.ironingStaff', 'staff')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('i.ironingCompletedAt IS NOT NULL')
      .andWhere('EXTRACT(MONTH FROM i.ironingCompletedAt) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM i.ironingCompletedAt) = :year', { year });

    if (branchId) qb.andWhere('o.branchId = :branchId', { branchId });
    if (actor.role === UserRole.IRONING) {
      qb.andWhere('i.ironingStaffId = :staffId', { staffId: actor.id });
    }

    const items = await qb.getMany();
    const unpaidItems = items.filter((i) => !i.ironingPaidAt);
    const paidItems = items.filter((i) => Boolean(i.ironingPaidAt));

    return {
      month,
      year,
      totalItems: items.length,
      unpaidAmount: sumMoney(unpaidItems.map((i) => Number(i.ironingWage || 0))),
      paidAmount: sumMoney(paidItems.map((i) => Number(i.ironingWage || 0))),
      totalAmount: sumMoney(items.map((i) => Number(i.ironingWage || 0))),
    };
  }

  async getIroningHistory(
    actor: LaundryAuthUser,
    query: IroningEarningsQueryDto,
  ) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const qb = this.itemsRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.order', 'o')
      .innerJoinAndSelect('o.customer', 'c')
      .innerJoinAndSelect('o.branch', 'b')
      .leftJoinAndSelect('i.ironingStaff', 'staff')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('i.ironingCompletedAt IS NOT NULL');

    if (branchId) qb.andWhere('o.branchId = :branchId', { branchId });
    if (actor.role === UserRole.IRONING) {
      qb.andWhere('i.ironingStaffId = :staffId', { staffId: actor.id });
    }
    if (query.month && query.year) {
      qb.andWhere('EXTRACT(MONTH FROM i.ironingCompletedAt) = :month', {
        month: query.month,
      }).andWhere('EXTRACT(YEAR FROM i.ironingCompletedAt) = :year', {
        year: query.year,
      });
    }

    return qb.orderBy('i.ironingCompletedAt', 'DESC').getMany();
  }

  async requestIroningPayout(
    actor: LaundryAuthUser,
    dto: RequestIroningPayoutDto,
  ) {
    const branchId = requireActorWriteBranch(actor);
    const items = await this.itemsRepo
      .createQueryBuilder('i')
      .innerJoin('i.order', 'o')
      .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('o.branchId = :branchId', { branchId })
      .andWhere('i.ironingStaffId = :staffId', { staffId: actor.id })
      .andWhere('i.ironingCompletedAt IS NOT NULL')
      .andWhere('i.ironingPaidAt IS NULL')
      .andWhere('EXTRACT(MONTH FROM i.ironingCompletedAt) = :month', {
        month: dto.month,
      })
      .andWhere('EXTRACT(YEAR FROM i.ironingCompletedAt) = :year', {
        year: dto.year,
      })
      .getMany();

    if (items.length === 0) {
      throw new BadRequestException(
        'Tidak ada upah setrika yang belum dibayar pada periode tersebut',
      );
    }

    const amount = sumMoney(items.map((i) => Number(i.ironingWage || 0)));
    return this.payoutsRepo.save(
      this.payoutsRepo.create({
        tenantId: actor.tenantId,
        branchId,
        employeeStaffId: actor.id,
        periodMonth: dto.month,
        periodYear: dto.year,
        amount,
        totalItems: items.length,
        status: ExpenseApprovalStatus.PENDING,
        employeeNotes: dto.employeeNotes ?? null,
      }),
    );
  }

  async listIroningPayouts(
    actor: LaundryAuthUser,
    query: ListIroningPayoutsQueryDto,
  ) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const where: Record<string, unknown> = { tenantId: actor.tenantId };
    if (branchId) where.branchId = branchId;
    if (actor.role === UserRole.IRONING) where.employeeStaffId = actor.id;

    return this.payoutsRepo.find({
      where,
      relations: { employee: true, branch: true },
      order: { createdAt: 'DESC' },
    });
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
    return payout;
  }

  async payIroningPayout(
    id: string,
    dto: ApproveIroningPayoutDto,
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

      const now = new Date();
      const unpaidItems = await manager
        .createQueryBuilder(LaundryOrderItem, 'i')
        .innerJoin('i.order', 'o')
        .where('i.tenantId = :tenantId', { tenantId: actor.tenantId })
        .andWhere('o.branchId = :branchId', { branchId: payout.branchId })
        .andWhere('i.ironingStaffId = :staffId', {
          staffId: payout.employeeStaffId,
        })
        .andWhere('i.ironingCompletedAt IS NOT NULL')
        .andWhere('i.ironingPaidAt IS NULL')
        .andWhere('EXTRACT(MONTH FROM i.ironingCompletedAt) = :month', {
          month: payout.periodMonth,
        })
        .andWhere('EXTRACT(YEAR FROM i.ironingCompletedAt) = :year', {
          year: payout.periodYear,
        })
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
      return manager.save(payout);
    });
  }

  async rejectIroningPayout(
    id: string,
    dto: RejectIroningPayoutDto,
    actor: LaundryAuthUser,
  ) {
    const payout = await this.getIroningPayoutDetail(id, actor);
    if (payout.status !== ExpenseApprovalStatus.PENDING) {
      throw new BadRequestException('Pengajuan ini sudah diproses sebelumnya');
    }
    payout.status = ExpenseApprovalStatus.REJECTED;
    payout.rejectedByStaffId = actor.id;
    payout.rejectedAt = new Date();
    payout.rejectionReason = dto.rejectionReason;
    return this.payoutsRepo.save(payout);
  }
}
