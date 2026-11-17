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
import { normalizePhone } from '../common/utils/phone.js';
import {
  requireActorWriteBranch,
  resolveActorBranchScope,
} from '../common/utils/scope.js';
import { PlatformClientService } from '../platform/platform-client.service.js';
import type { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto.js';
import { LaundryStaff } from './laundry-staff.entity.js';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(LaundryStaff)
    private readonly staffRepo: Repository<LaundryStaff>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    private readonly platformClient: PlatformClientService,
  ) {}

  async list(
    actor: LaundryAuthUser,
    requestedBranchId?: string,
    role?: UserRole,
  ) {
    const branchId = resolveActorBranchScope(actor, requestedBranchId);
    const where: Record<string, unknown> = { tenantId: actor.tenantId };
    if (branchId) where.branchId = branchId;
    if (role) where.role = role;
    return this.staffRepo.find({
      where,
      relations: { branch: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string, actor: LaundryAuthUser) {
    const staff = await this.staffRepo.findOne({
      where: { id, tenantId: actor.tenantId },
      relations: { branch: true },
    });
    if (!staff) throw new NotFoundException('Pegawai tidak ditemukan');
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      staff.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Anda tidak memiliki akses ke pegawai cabang lain');
    }
    return staff;
  }

  async create(dto: CreateStaffDto, actor: LaundryAuthUser) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email atau nomor HP pegawai wajib diisi');
    }
    if (actor.role !== UserRole.SUPER_OWNER && dto.role === UserRole.SUPER_OWNER) {
      throw new ForbiddenException('Hanya Super Owner yang dapat membuat Super Owner');
    }
    if (
      actor.role === UserRole.BRANCH_OWNER &&
      dto.role === UserRole.BRANCH_OWNER
    ) {
      throw new ForbiddenException('Owner cabang tidak dapat membuat akun owner lain');
    }

    let targetBranchId: string | null = null;
    if (dto.role !== UserRole.SUPER_OWNER) {
      targetBranchId = requireActorWriteBranch(actor, dto.branchId);
      const branch = await this.branchesRepo.findOne({
        where: { id: targetBranchId, tenantId: actor.tenantId, isActive: true },
      });
      if (!branch) {
        throw new BadRequestException('Cabang tidak ditemukan atau tidak aktif');
      }
    }

    const cleanPhone = dto.phone ? normalizePhone(dto.phone) ?? dto.phone : null;
    const provisioned = await this.platformClient.provisionStaffAccount({
      tenantId: actor.tenantId,
      name: dto.name,
      email: dto.email ?? null,
      phone: cleanPhone,
      password: dto.password,
      membershipRole:
        dto.role === UserRole.SUPER_OWNER ? 'TENANT_ADMIN' : 'TENANT_STAFF',
    });

    const existing = await this.staffRepo.findOne({
      where: {
        tenantId: actor.tenantId,
        platformUserId: provisioned.user.id,
      },
    });
    if (existing) {
      existing.branchId = targetBranchId;
      existing.role = dto.role;
      existing.name = dto.name;
      existing.email = dto.email ?? null;
      existing.phone = cleanPhone;
      existing.isActive = true;
      if (dto.avatarUrl !== undefined) existing.avatarUrl = dto.avatarUrl;
      if (dto.faceDescriptor !== undefined) existing.faceDescriptor = dto.faceDescriptor;
      return this.staffRepo.save(existing);
    }

    return this.staffRepo.save(
      this.staffRepo.create({
        tenantId: actor.tenantId,
        platformUserId: provisioned.user.id,
        branchId: targetBranchId,
        name: dto.name,
        email: dto.email ?? null,
        phone: cleanPhone,
        role: dto.role,
        avatarUrl: dto.avatarUrl ?? null,
        faceDescriptor: dto.faceDescriptor ?? null,
        isActive: true,
      }),
    );
  }

  async update(id: string, dto: UpdateStaffDto, actor: LaundryAuthUser) {
    const staff = await this.getById(id, actor);
    if (actor.role !== UserRole.SUPER_OWNER && dto.role === UserRole.SUPER_OWNER) {
      throw new ForbiddenException('Hanya Super Owner yang dapat mengubah role ke Super Owner');
    }

    const cleanPhone =
      dto.phone !== undefined
        ? dto.phone
          ? normalizePhone(dto.phone) ?? dto.phone
          : null
        : undefined;

    await this.platformClient.updateStaffAccount(staff.platformUserId, {
      tenantId: actor.tenantId,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(cleanPhone !== undefined ? { phone: cleanPhone } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.password ? { newPassword: dto.password } : {}),
    });

    if (dto.name !== undefined) staff.name = dto.name;
    if (dto.email !== undefined) staff.email = dto.email;
    if (cleanPhone !== undefined) staff.phone = cleanPhone;
    if (dto.role !== undefined) staff.role = dto.role;
    if (dto.branchId !== undefined && actor.role === UserRole.SUPER_OWNER) {
      staff.branchId = dto.branchId;
    }
    if (dto.avatarUrl !== undefined) staff.avatarUrl = dto.avatarUrl;
    if (dto.faceDescriptor !== undefined) staff.faceDescriptor = dto.faceDescriptor;
    if (dto.isActive !== undefined) staff.isActive = dto.isActive;

    return this.staffRepo.save(staff);
  }

  async resetPassword(id: string, newPassword: string, actor: LaundryAuthUser) {
    const staff = await this.getById(id, actor);
    await this.platformClient.updateStaffAccount(staff.platformUserId, {
      tenantId: actor.tenantId,
      newPassword,
    });
    return { success: true };
  }

  async updateFaceDescriptor(
    id: string,
    faceDescriptor: string,
    actor: LaundryAuthUser,
  ) {
    const staff = await this.getById(id, actor);
    staff.faceDescriptor = faceDescriptor;
    return this.staffRepo.save(staff);
  }
}
