import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import {
  requireActorWriteBranch,
  resolveActorBranchScope,
} from '../common/utils/scope.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { Attendance } from './attendance.entity.js';
import type {
  ClockAttendanceDto,
  MonthlyAttendanceQueryDto,
} from './dto/attendance.dto.js';

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

@Injectable()
export class AttendancesService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendancesRepo: Repository<Attendance>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(LaundryStaff)
    private readonly staffRepo: Repository<LaundryStaff>,
  ) {}

  async getBranchCandidates(actor: LaundryAuthUser, requestedBranchId?: string) {
    const branchId = requireActorWriteBranch(actor, requestedBranchId);
    const staffList = await this.staffRepo.find({
      where: { tenantId: actor.tenantId, branchId, isActive: true },
      order: { name: 'ASC' },
    });
    return staffList.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      avatarUrl: s.avatarUrl,
      faceDescriptor: s.faceDescriptor,
    }));
  }

  async clockAttendance(dto: ClockAttendanceDto, actor: LaundryAuthUser) {
    const branchId = requireActorWriteBranch(actor, dto.branchId);
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId, tenantId: actor.tenantId, isActive: true },
    });
    if (!branch) throw new NotFoundException('Cabang tidak ditemukan');

    const targetStaffId = dto.staffId ?? actor.id;
    const staff = await this.staffRepo.findOne({
      where: { id: targetStaffId, tenantId: actor.tenantId, isActive: true },
    });
    if (!staff) throw new NotFoundException('Pegawai tidak ditemukan');
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      staff.branchId !== branch.id
    ) {
      throw new ForbiddenException('Pegawai bukan anggota cabang ini');
    }

    let distanceMeters: number | null = null;
    if (branch.latitude !== null && branch.longitude !== null) {
      if (dto.latitude === undefined || dto.longitude === undefined) {
        throw new BadRequestException(
          'Koordinat GPS wajib dikirim untuk validasi radius cabang',
        );
      }
      distanceMeters = haversineMeters(
        Number(branch.latitude),
        Number(branch.longitude),
        dto.latitude,
        dto.longitude,
      );
      if (distanceMeters > Number(branch.attendanceRadiusMeters || 10)) {
        throw new BadRequestException(
          `Lokasi Anda berjarak ${distanceMeters}m dari cabang (batas maksimal ${branch.attendanceRadiusMeters}m)`,
        );
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const existing = await this.attendancesRepo.findOne({
      where: {
        tenantId: actor.tenantId,
        staffId: staff.id,
        attendanceDate: today,
      },
    });

    if (!existing) {
      return {
        action: 'CHECK_IN' as const,
        attendance: await this.attendancesRepo.save(
          this.attendancesRepo.create({
            tenantId: actor.tenantId,
            branchId: branch.id,
            staffId: staff.id,
            recordedByStaffId: actor.id,
            attendanceDate: today,
            checkInAt: new Date(),
            checkInLat: dto.latitude ?? null,
            checkInLng: dto.longitude ?? null,
            checkInDistanceMeters: distanceMeters,
            faceDistance: dto.faceDistance ?? null,
            notes: dto.notes ?? null,
          }),
        ),
      };
    }

    if (existing.checkOutAt) {
      throw new BadRequestException('Pegawai sudah melakukan check-in & check-out hari ini');
    }

    existing.checkOutAt = new Date();
    existing.checkOutLat = dto.latitude ?? null;
    existing.checkOutLng = dto.longitude ?? null;
    existing.checkOutDistanceMeters = distanceMeters;
    return {
      action: 'CHECK_OUT' as const,
      attendance: await this.attendancesRepo.save(existing),
    };
  }

  async getMonthlySummary(
    actor: LaundryAuthUser,
    query: MonthlyAttendanceQueryDto,
  ) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();

    const qb = this.attendancesRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.staff', 'staff')
      .leftJoinAndSelect('a.branch', 'branch')
      .where('a.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('EXTRACT(MONTH FROM a.attendanceDate) = :month', { month })
      .andWhere('EXTRACT(YEAR FROM a.attendanceDate) = :year', { year });

    if (branchId) qb.andWhere('a.branchId = :branchId', { branchId });
    if (
      actor.role === UserRole.CASHIER ||
      actor.role === UserRole.WASHING ||
      actor.role === UserRole.IRONING
    ) {
      qb.andWhere('a.staffId = :staffId', { staffId: actor.id });
    }

    const records = await qb.orderBy('a.attendanceDate', 'DESC').getMany();
    return { month, year, records };
  }
}
