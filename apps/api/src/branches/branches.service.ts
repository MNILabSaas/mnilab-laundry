import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { resolveActorBranchScope } from '../common/utils/scope.js';
import { PlatformClientService } from '../platform/platform-client.service.js';
import { getActiveTenantContext } from '../tenant-context/tenant-context.js';
import { Branch } from './branch.entity.js';
import type { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto.js';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    private readonly platformClient: PlatformClientService,
  ) {}

  listPublic(tenantId: string) {
    return this.branchesRepo.find({
      where: { tenantId, isActive: true },
      order: { isMain: 'DESC', name: 'ASC' },
    });
  }

  async list(actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor);
    return this.branchesRepo.find({
      where: branchId
        ? { tenantId: actor.tenantId, id: branchId }
        : { tenantId: actor.tenantId },
      order: { isMain: 'DESC', name: 'ASC' },
    });
  }

  async getById(id: string, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, id);
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId ?? id, tenantId: actor.tenantId },
    });
    if (!branch) throw new NotFoundException('Cabang tidak ditemukan');
    return branch;
  }

  async create(dto: CreateBranchDto, actor: LaundryAuthUser) {
    const activeCtx = getActiveTenantContext();
    const entitlement = await this.platformClient.getEntitlement(
      actor.tenantId,
      true,
    );
    const maxBranches =
      entitlement.limits?.maxBranches ??
      activeCtx?.entitlement.limits?.maxBranches ??
      1;
    const activeCount = await this.branchesRepo.count({
      where: { tenantId: actor.tenantId, isActive: true },
    });
    if (activeCount >= maxBranches) {
      throw new ForbiddenException(
        `Batas paket Anda maksimal ${maxBranches} cabang aktif. Silakan upgrade paket di MNILab Platform.`,
      );
    }

    const code = dto.code.trim().toUpperCase();
    const exists = await this.branchesRepo.findOne({
      where: { tenantId: actor.tenantId, code },
    });
    if (exists) {
      throw new ConflictException(`Kode cabang "${code}" sudah digunakan`);
    }

    if (dto.isMain) {
      await this.branchesRepo.update(
        { tenantId: actor.tenantId, isMain: true },
        { isMain: false },
      );
    }

    return this.branchesRepo.save(
      this.branchesRepo.create({
        tenantId: actor.tenantId,
        name: dto.name,
        code,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        whatsappNumber: dto.whatsappNumber ?? null,
        ironingRate: dto.ironingRate ?? 1100,
        openTime: dto.openTime ?? '08:00',
        closeTime: dto.closeTime ?? '21:00',
        defaultMinWeightKg: dto.defaultMinWeightKg ?? 3,
        payLaterFee: dto.payLaterFee ?? 1000,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        attendanceRadiusMeters: dto.attendanceRadiusMeters ?? 10,
        isMain: dto.isMain ?? activeCount === 0,
        isActive: true,
      }),
    );
  }

  async update(id: string, dto: UpdateBranchDto, actor: LaundryAuthUser) {
    const branch = await this.getById(id, actor);
    if (actor.role !== UserRole.SUPER_OWNER && dto.isMain !== undefined) {
      throw new ForbiddenException('Hanya Super Owner yang dapat mengubah cabang utama');
    }
    if (dto.isMain) {
      await this.branchesRepo.update(
        { tenantId: actor.tenantId, isMain: true },
        { isMain: false },
      );
    }
    Object.assign(branch, dto);
    return this.branchesRepo.save(branch);
  }

  async deactivate(id: string, actor: LaundryAuthUser) {
    const branch = await this.getById(id, actor);
    branch.isActive = false;
    return this.branchesRepo.save(branch);
  }
}
