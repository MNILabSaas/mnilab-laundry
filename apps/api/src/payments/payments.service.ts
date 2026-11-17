import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import { PaymentStatus, UserRole } from '../common/enums.js';
import { compareMoney } from '../common/utils/money.js';
import { resolveActorBranchScope } from '../common/utils/scope.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { summarizePayments } from '../orders/pricing.js';
import type {
  CreatePaymentDto,
  ListPaymentsQueryDto,
  UpdatePaymentStatusDto,
} from './dto/payment.dto.js';
import { Payment } from './payment.entity.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
  ) {}

  async list(query: ListPaymentsQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const qb = this.paymentsRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.order', 'o')
      .leftJoinAndSelect('p.branch', 'b')
      .where('p.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) qb.andWhere('p.branchId = :branchId', { branchId });
    if (query.orderId) qb.andWhere('p.orderId = :orderId', { orderId: query.orderId });

    const [items, total] = await qb
      .orderBy('p.paidAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }

  async create(dto: CreatePaymentDto, actor: LaundryAuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(LaundryOrder, {
        where: { id: dto.orderId, tenantId: actor.tenantId },
      });
      if (!order) throw new NotFoundException('Pesanan tidak ditemukan');
      if (
        actor.role !== UserRole.SUPER_OWNER &&
        order.branchId !== actor.branchId
      ) {
        throw new ForbiddenException('Akses cabang lain ditolak');
      }

      const remaining = Number(order.total) - Number(order.paidAmount);
      if (compareMoney(dto.amount, remaining) > 0) {
        throw new BadRequestException(
          `Nominal pembayaran melebihi sisa tagihan (Rp${remaining.toLocaleString('id-ID')})`,
        );
      }

      const payment = await manager.save(
        manager.create(Payment, {
          tenantId: actor.tenantId,
          orderId: order.id,
          branchId: order.branchId,
          cashierStaffId: actor.id,
          amount: dto.amount,
          method: dto.method,
          status: PaymentStatus.SUCCESS,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
        }),
      );

      const successPayments = await manager.find(Payment, {
        where: {
          orderId: order.id,
          tenantId: actor.tenantId,
          status: PaymentStatus.SUCCESS,
        },
      });
      const summary = summarizePayments(
        Number(order.total),
        successPayments.map((p) => Number(p.amount)),
      );
      order.paidAmount = summary.paidAmount;
      order.paymentStatus = summary.paymentStatus;
      await manager.save(order);

      return payment;
    });
  }

  async updateStatus(
    id: string,
    dto: UpdatePaymentStatusDto,
    actor: LaundryAuthUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, {
        where: { id, tenantId: actor.tenantId },
        relations: { order: true },
      });
      if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan');
      if (
        actor.role !== UserRole.SUPER_OWNER &&
        payment.branchId !== actor.branchId
      ) {
        throw new ForbiddenException('Akses cabang lain ditolak');
      }

      payment.status = dto.status;
      await manager.save(payment);

      const successPayments = await manager.find(Payment, {
        where: {
          orderId: payment.orderId,
          tenantId: actor.tenantId,
          status: PaymentStatus.SUCCESS,
        },
      });
      const summary = summarizePayments(
        Number(payment.order.total),
        successPayments.map((p) => Number(p.amount)),
      );
      payment.order.paidAmount = summary.paidAmount;
      payment.order.paymentStatus = summary.paymentStatus;
      await manager.save(payment.order);

      return payment;
    });
  }
}
