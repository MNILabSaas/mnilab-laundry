import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import { Public } from '../common/auth/auth.decorators.js';
import { Trim } from '../common/dto/transforms.js';
import { ITEM_STATUS_LABELS } from '../common/enums.js';
import { maskName, maskOrderNumber } from '../common/utils/mask.js';
import {
  hasMeaningfulSearchChars,
  isValidUuid,
  toSafeLikeContain,
} from '../common/utils/security.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { getActiveTenantContext } from '../tenant-context/tenant-context.js';
import { getWorkflow } from '../workflow/workflow.config.js';

export class PublicTrackingQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(64)
  branchId?: string;
}

@Injectable()
export class PublicTrackingService {
  constructor(
    @InjectRepository(LaundryOrder)
    private readonly ordersRepo: Repository<LaundryOrder>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
  ) {}

  private toPublicDto(order: LaundryOrder) {
    return {
      orderNumber: maskOrderNumber(order.orderNumber),
      branchId: order.branchId,
      branchName: order.branch?.name ?? null,
      customerDisplayName: maskName(order.customer?.name || 'Pelanggan'),
      receivedAt: order.receivedAt,
      estimatedCompletionAt: order.estimatedCompletionAt,
      isPickedUp: Boolean(order.pickedUpAt),
      items: (order.items || []).map((item) => {
        const wf = getWorkflow(item.workflow);
        const currentIdx = wf.statuses.indexOf(item.status);
        return {
          serviceName: item.serviceName,
          status: item.status,
          statusLabel: ITEM_STATUS_LABELS[item.status] || item.status,
          steps: wf.statuses.map((st, idx) => ({
            code: st,
            label: ITEM_STATUS_LABELS[st] || st,
            done: idx <= currentIdx,
            active: idx === currentIdx,
          })),
        };
      }),
    };
  }

  async search(tenantId: string, query: PublicTrackingQueryDto) {
    const raw = (query.q || '').trim();
    if (!hasMeaningfulSearchChars(raw, 2)) {
      throw new BadRequestException(
        'Masukkan minimal 2 karakter huruf/angka untuk melacak pesanan',
      );
    }

    if (query.branchId) {
      if (!isValidUuid(query.branchId)) {
        throw new BadRequestException('Format ID cabang tidak valid');
      }
      const target = await this.branchesRepo.findOne({
        where: { id: query.branchId, tenantId, isActive: true },
      });
      if (!target) throw new NotFoundException('Cabang tidak ditemukan');
    }

    const pattern = toSafeLikeContain(raw);
    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.branch', 'b')
      .innerJoinAndSelect('o.customer', 'c')
      .leftJoinAndSelect('o.items', 'i')
      .where('o.tenantId = :tenantId', { tenantId })
      .andWhere(
        `(o.orderNumber ILIKE :p ESCAPE '\\' OR c.name ILIKE :p ESCAPE '\\')`,
        { p: pattern },
      );

    if (query.branchId) {
      qb.andWhere('o.branchId = :branchId', { branchId: query.branchId });
    }

    const orders = await qb.orderBy('o.receivedAt', 'DESC').take(10).getMany();
    return orders.map((o) => this.toPublicDto(o));
  }

  async findByOrderNumber(tenantId: string, orderNumber: string) {
    const clean = orderNumber.trim().toUpperCase();
    if (!hasMeaningfulSearchChars(clean, 3)) {
      throw new BadRequestException('Nomor nota tidak valid');
    }
    const order = await this.ordersRepo.findOne({
      where: { tenantId, orderNumber: clean },
      relations: { branch: true, customer: true, items: true },
    });
    if (!order) throw new NotFoundException('Nomor nota tidak ditemukan');
    return this.toPublicDto(order);
  }
}

@Controller('public/tracking')
@Public()
export class PublicTrackingController {
  constructor(private readonly trackingService: PublicTrackingService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('search')
  search(@Query() query: PublicTrackingQueryDto) {
    const ctx = getActiveTenantContext();
    if (!ctx) throw new BadRequestException('Tenant tidak teridentifikasi');
    return this.trackingService.search(ctx.tenantId, query);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':orderNumber')
  getByOrderNumber(@Param('orderNumber') orderNumber: string) {
    const ctx = getActiveTenantContext();
    if (!ctx) throw new BadRequestException('Tenant tidak teridentifikasi');
    return this.trackingService.findByOrderNumber(ctx.tenantId, orderNumber);
  }
}
