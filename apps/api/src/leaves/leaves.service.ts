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

  list(query: ListLeaveRequestsQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const where: Record<string, unknown> = { tenantId: actor.tenantId };
    if (branchId) where.branchId = branchId;
    if (
      actor.role === UserRole.CASHIER ||
      actor.role === UserRole.WASHING ||
      actor.role === UserRole.IRONING
    ) {
      where.staffId = actor.id;
    }

    return this.leavesRepo.find({
      where,
      relations: { staff: true, branch: true },
      order: { createdAt: 'DESC' },
    });
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

    return this.leavesRepo.save(
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
  }

  async decide(
    id: string,
    dto: DecideLeaveRequestDto,
    actor: LaundryAuthUser,
  ) {
    const leave = await this.leavesRepo.findOne({
      where: { id, tenantId: actor.tenantId },
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
    return this.leavesRepo.save(leave);
  }
}
