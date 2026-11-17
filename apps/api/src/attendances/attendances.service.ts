import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { resolveActorBranchScope } from '../common/utils/scope.js';
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

function getJakartaDateStr(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${day}`;
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

  private enrichRecord(rec: Attendance) {
    const workDurationMinutes =
      rec.checkInAt && rec.checkOutAt
        ? Math.max(
            1,
            Math.round(
              (new Date(rec.checkOutAt).getTime() -
                new Date(rec.checkInAt).getTime()) /
                60_000,
            ),
          )
        : null;
    const status = rec.checkOutAt ? 'COMPLETED' : 'CHECKED_IN';
    return Object.assign(rec, {
      userId: rec.staffId,
      user: rec.staff ?? null,
      recordedById: rec.recordedByStaffId,
      recordedBy: null,
      checkInPhoto: null,
      checkOutPhoto: null,
      faceMatchScore: rec.faceDistance ?? 95,
      workDurationMinutes,
      status,
    });
  }

  async getBranchCandidates(actor: LaundryAuthUser, requestedBranchId?: string) {
    let branchId = resolveActorBranchScope(actor, requestedBranchId);
    if (!branchId) {
      const mainBranch = await this.branchesRepo.findOne({
        where: { tenantId: actor.tenantId, isActive: true },
        order: { isMain: 'DESC', createdAt: 'ASC' },
      });
      branchId = mainBranch?.id ?? null;
    }
    if (!branchId) {
      throw new BadRequestException('Cabang belum ditentukan untuk sistem absen');
    }

    const branch = await this.branchesRepo.findOne({
      where: { id: branchId, tenantId: actor.tenantId },
    });
    if (!branch) throw new NotFoundException('Cabang tidak ditemukan');

    const staffList = await this.staffRepo.find({
      where: {
        tenantId: actor.tenantId,
        branchId,
        role: In([UserRole.CASHIER, UserRole.WASHING]),
        isActive: true,
      },
      order: { name: 'ASC' },
    });

    const todayStr = getJakartaDateStr();
    const todayRecords = await this.attendancesRepo.find({
      where: { tenantId: actor.tenantId, branchId, attendanceDate: todayStr },
      relations: { staff: true, branch: true },
    });
    const recordByStaff = new Map(
      todayRecords.map((r) => [r.staffId, this.enrichRecord(r)]),
    );

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code,
        address: branch.address,
        latitude: branch.latitude,
        longitude: branch.longitude,
        attendanceRadiusMeters: branch.attendanceRadiusMeters || 10,
      },
      todayDate: todayStr,
      employees: staffList.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        email: s.email,
        phone: s.phone,
        avatarUrl: s.avatarUrl,
        faceDescriptor: s.faceDescriptor,
        todayAttendance: recordByStaff.get(s.id) || null,
      })),
    };
  }

  async clockAttendance(dto: ClockAttendanceDto, actor: LaundryAuthUser) {
    const targetStaffId = dto.targetUserId ?? dto.staffId ?? actor.id;
    const staff = await this.staffRepo.findOne({
      where: { id: targetStaffId, tenantId: actor.tenantId, isActive: true },
    });
    if (!staff) throw new NotFoundException('Pegawai tidak ditemukan');

    const branchId = dto.branchId ?? staff.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException('Pegawai belum ditempatkan pada cabang outlet');
    }
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId, tenantId: actor.tenantId, isActive: true },
    });
    if (!branch) throw new NotFoundException('Cabang tidak ditemukan');

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
          `Di luar jangkauan outlet! Jarak Anda saat ini ${distanceMeters.toFixed(1)} meter dari ${branch.name} (Batas maksimal radius absen: ${branch.attendanceRadiusMeters || 10} meter).`,
        );
      }
    }

    const today = getJakartaDateStr();
    const existing = await this.attendancesRepo.findOne({
      where: {
        tenantId: actor.tenantId,
        staffId: staff.id,
        attendanceDate: today,
      },
      relations: { staff: true, branch: true },
    });

    if (dto.action === 'CHECK_IN' && existing) {
      throw new ConflictException(
        `${staff.name} sudah melakukan Absen Masuk hari ini`,
      );
    }

    if (!existing) {
      if (dto.action === 'CHECK_OUT') {
        throw new BadRequestException(
          `${staff.name} belum melakukan Absen Masuk hari ini. Silakan Absen Masuk terlebih dahulu.`,
        );
      }
      const saved = await this.attendancesRepo.save(
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
          faceDistance: dto.faceMatchScore ?? dto.faceDistance ?? 95,
          notes: dto.notes ?? null,
        }),
      );
      const reloaded = await this.attendancesRepo.findOne({
        where: { id: saved.id, tenantId: actor.tenantId },
        relations: { staff: true, branch: true },
      });
      return this.enrichRecord(reloaded ?? saved);
    }

    if (existing.checkOutAt) {
      throw new ConflictException(
        `${staff.name} sudah melakukan Absen Masuk & Pulang hari ini`,
      );
    }

    existing.checkOutAt = new Date();
    existing.checkOutLat = dto.latitude ?? null;
    existing.checkOutLng = dto.longitude ?? null;
    existing.checkOutDistanceMeters = distanceMeters;
    if (dto.faceMatchScore !== undefined) {
      existing.faceDistance = dto.faceMatchScore;
    }
    const saved = await this.attendancesRepo.save(existing);
    return this.enrichRecord(saved);
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

    const rawRecords = await qb
      .orderBy('a.attendanceDate', 'DESC')
      .addOrderBy('a.checkInAt', 'DESC')
      .getMany();
    const records = rawRecords.map((r) => this.enrichRecord(r));

    const empQb = this.staffRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.branch', 'b')
      .where('s.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('s.role IN (:...roles)', {
        roles: [UserRole.CASHIER, UserRole.WASHING],
      })
      .andWhere('s.isActive = true')
      .orderBy('s.name', 'ASC');

    if (branchId) empQb.andWhere('s.branchId = :branchId', { branchId });
    const employees = await empQb.getMany();

    const summaryMap = new Map<
      string,
      {
        userId: string;
        userName: string;
        role: UserRole;
        avatarUrl: string | null;
        branchId: string | null;
        branchName: string;
        totalDaysPresent: number;
        completedDays: number;
        totalMinutes: number;
        totalHours: number;
      }
    >();

    for (const emp of employees) {
      summaryMap.set(emp.id, {
        userId: emp.id,
        userName: emp.name,
        role: emp.role,
        avatarUrl: emp.avatarUrl,
        branchId: emp.branchId,
        branchName: emp.branch?.name || '-',
        totalDaysPresent: 0,
        completedDays: 0,
        totalMinutes: 0,
        totalHours: 0,
      });
    }

    for (const rec of records) {
      let item = summaryMap.get(rec.staffId);
      if (!item && rec.staff) {
        item = {
          userId: rec.staffId,
          userName: rec.staff.name,
          role: rec.staff.role,
          avatarUrl: rec.staff.avatarUrl,
          branchId: rec.branchId,
          branchName: rec.branch?.name || '-',
          totalDaysPresent: 0,
          completedDays: 0,
          totalMinutes: 0,
          totalHours: 0,
        };
        summaryMap.set(rec.staffId, item);
      }
      if (item) {
        item.totalDaysPresent += 1;
        if (rec.status === 'COMPLETED' && rec.workDurationMinutes) {
          item.completedDays += 1;
          item.totalMinutes += Number(rec.workDurationMinutes);
        } else if (rec.checkInAt && !rec.checkOutAt) {
          const elapsedMin = Math.max(
            1,
            Math.round((Date.now() - new Date(rec.checkInAt).getTime()) / 60_000),
          );
          item.totalMinutes += elapsedMin;
        }
      }
    }

    const employeeSummaries = Array.from(summaryMap.values()).map((s) => ({
      ...s,
      totalHours: Math.round((s.totalMinutes / 60) * 100) / 100,
    }));

    const branchList = await this.branchesRepo.find({
      where: branchId
        ? { tenantId: actor.tenantId, id: branchId }
        : { tenantId: actor.tenantId, isActive: true },
      order: { isMain: 'DESC', createdAt: 'ASC' },
    });

    const branchSummaries = branchList.map((branch) => {
      const branchEmployees = employeeSummaries.filter(
        (e) => e.branchId === branch.id,
      );
      const branchRecords = records.filter((r) => r.branchId === branch.id);
      const totalMinutes = branchEmployees.reduce(
        (sum, e) => sum + e.totalMinutes,
        0,
      );
      const totalDaysPresent = branchRecords.length;
      const completedDays = branchRecords.filter(
        (r) => r.status === 'COMPLETED',
      ).length;

      return {
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        branchAddress: branch.address,
        isMain: branch.isMain,
        totalEmployees: branchEmployees.length,
        totalDaysPresent,
        completedDays,
        totalMinutes,
        totalHours: Math.round((totalMinutes / 60) * 100) / 100,
        employeeSummaries: branchEmployees,
        records: branchRecords,
      };
    });

    return {
      month,
      year,
      branchId: branchId ?? null,
      employeeSummaries,
      branchSummaries,
      records,
    };
  }
}
