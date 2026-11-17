import {
  BadRequestException,
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
  CreateLeaveRequestDto,
  DecideLeaveRequestDto,
  ListLeaveRequestsQueryDto,
} from './dto/leave-request.dto.js';
import { LeaveRequest } from './leave-request.entity.js';

@Injectable()
export class LeavesService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leavesRepo: Repository<LeaveRequest>,
  ) {}

  private enrichLeave(l: LeaveRequest) {
    return Object.assign(l, {
      userId: l.staffId,
      user: l.staff ?? null,
      reviewedById: l.reviewedByStaffId,
    });
  }

  async list(query: ListLeaveRequestsQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.leavesRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.staff', 'staff')
      .leftJoinAndSelect('l.branch', 'branch')
      .leftJoinAndSelect('l.reviewedBy', 'reviewedBy')
      .where('l.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) qb.andWhere('l.branchId = :branchId', { branchId });
    if (
      actor.role === UserRole.CASHIER ||
      actor.role === UserRole.WASHING ||
      actor.role === UserRole.IRONING
    ) {
      qb.andWhere('l.staffId = :staffId', { staffId: actor.id });
    }
    if (query.status) {
      qb.andWhere('l.status = :status', { status: query.status });
    }

    const [rawItems, total] = await qb
      .orderBy('l.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = rawItems.map((l) => this.enrichLeave(l));
    return { data, items: data, total, page, limit };
  }

  async create(dto: CreateLeaveRequestDto, actor: LaundryAuthUser) {
    const branchId = requireActorWriteBranch(actor);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('Tanggal akhir harus >= tanggal mulai');
    }
    const totalDays =
      Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    const saved = await this.leavesRepo.save(
      this.leavesRepo.create({
        tenantId: actor.tenantId,
        branchId,
        staffId: actor.id,
        leaveType: dto.leaveType,
        startDate: dto.startDate,
        endDate: dto.endDate,
        totalDays,
        reason: dto.reason,
        status: ExpenseApprovalStatus.PENDING,
      }),
    );
    const reloaded = await this.leavesRepo.findOne({
      where: { id: saved.id, tenantId: actor.tenantId },
      relations: { staff: true, branch: true, reviewedBy: true },
    });
    return this.enrichLeave(reloaded ?? saved);
  }

  async decide(
    id: string,
    dto: DecideLeaveRequestDto,
    actor: LaundryAuthUser,
  ) {
    const leave = await this.leavesRepo.findOne({
      where: { id, tenantId: actor.tenantId },
      relations: { staff: true, branch: true, reviewedBy: true },
    });
    if (!leave) throw new NotFoundException('Pengajuan cuti tidak ditemukan');
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      leave.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Akses cabang lain ditolak');
    }
    if (leave.status !== ExpenseApprovalStatus.PENDING) {
      throw new BadRequestException('Pengajuan cuti sudah diproses');
    }

    leave.status = dto.status;
    leave.reviewedByStaffId = actor.id;
    leave.reviewedAt = new Date();
    leave.reviewNotes = dto.reviewNotes ?? null;
    const saved = await this.leavesRepo.save(leave);
    return this.enrichLeave(saved);
  }
}
