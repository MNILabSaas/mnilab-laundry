import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { compareMoney } from '../common/utils/money.js';
import { resolveActorBranchScope } from '../common/utils/scope.js';
import { WORKFLOWS } from '../workflow/workflow.config.js';
import type {
  CreateLaundryServiceDto,
  ListLaundryServicesQueryDto,
  UpdateLaundryServiceDto,
} from './dto/laundry-service.dto.js';
import { LaundryService } from './laundry-service.entity.js';
import { ServicePriceHistory } from './service-price-history.entity.js';

@Injectable()
export class LaundryServicesService {
  constructor(
    @InjectRepository(LaundryService)
    private readonly servicesRepo: Repository<LaundryService>,
    @InjectRepository(ServicePriceHistory)
    private readonly historyRepo: Repository<ServicePriceHistory>,
  ) {}

  listWorkflows() {
    return Object.values(WORKFLOWS);
  }

  async listPublicCatalog(tenantId: string, branchId?: string) {
    const where = branchId
      ? [
          { tenantId, branchId, isActive: true },
          { tenantId, branchId: IsNull(), isActive: true },
        ]
      : { tenantId, isActive: true };
    return this.servicesRepo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  async list(query: ListLaundryServicesQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const qb = this.servicesRepo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) {
      qb.andWhere('(s.branchId = :branchId OR s.branchId IS NULL)', { branchId });
    }
    if (!query.includeInactive) {
      qb.andWhere('s.isActive = true');
    }

    return qb.orderBy('s.name', 'ASC').getMany();
  }

  async getById(id: string, actor: LaundryAuthUser) {
    const svc = await this.servicesRepo.findOne({
      where: { id, tenantId: actor.tenantId },
    });
    if (!svc) throw new NotFoundException('Layanan tidak ditemukan');
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      svc.branchId &&
      svc.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Anda tidak memiliki akses ke layanan cabang lain');
    }
    return svc;
  }

  async getPriceHistory(id: string, actor: LaundryAuthUser) {
    await this.getById(id, actor);
    return this.historyRepo.find({
      where: { serviceId: id, tenantId: actor.tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(dto: CreateLaundryServiceDto, actor: LaundryAuthUser) {
    const branchId =
      actor.role === UserRole.SUPER_OWNER
        ? dto.branchId ?? null
        : resolveActorBranchScope(actor, dto.branchId);

    const entity = this.servicesRepo.create({
      tenantId: actor.tenantId,
      branchId,
      name: dto.name,
      description: dto.description ?? null,
      workflow: dto.workflow,
      priceUnit: dto.priceUnit,
      price: dto.price,
      minWeightKg: dto.minWeightKg ?? null,
      estimatedDurationHours: dto.estimatedDurationHours ?? null,
      discountType: dto.discountType ?? 'NONE',
      discountValue: dto.discountValue ?? 0,
      discountActive: dto.discountActive ?? false,
      isThirdParty: dto.isThirdParty ?? false,
      thirdPartyPartner: dto.thirdPartyPartner ?? null,
      isActive: true,
    });
    return this.servicesRepo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateLaundryServiceDto,
    actor: LaundryAuthUser,
  ) {
    const svc = await this.getById(id, actor);
    const oldPrice = Number(svc.price);

    const { priceChangeReason, ...rest } = dto;
    Object.assign(svc, rest);
    const saved = await this.servicesRepo.save(svc);

    if (dto.price !== undefined && compareMoney(oldPrice, dto.price) !== 0) {
      await this.historyRepo.save(
        this.historyRepo.create({
          tenantId: actor.tenantId,
          serviceId: svc.id,
          oldPrice,
          newPrice: dto.price,
          changedByStaffId: actor.id,
          reason: priceChangeReason ?? 'Pembaruan tarif layanan',
        }),
      );
    }

    return saved;
  }

  async remove(id: string, actor: LaundryAuthUser) {
    const svc = await this.getById(id, actor);
    svc.isActive = false;
    return this.servicesRepo.save(svc);
  }
}
