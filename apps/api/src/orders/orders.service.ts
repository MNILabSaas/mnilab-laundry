import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import {
  ITEM_STATUS_LABELS,
  OrderPaymentStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '../common/enums.js';
import { compareMoney, sumMoney } from '../common/utils/money.js';
import { generateOrderNumber } from '../common/utils/order-number.js';
import { normalizeCustomerPhone } from '../common/utils/phone.js';
import {
  requireActorWriteBranch,
  resolveActorBranchScope,
} from '../common/utils/scope.js';
import { toSafeLikeContain } from '../common/utils/security.js';
import { Customer } from '../customers/customer.entity.js';
import { LaundryService } from '../laundry-services/laundry-service.entity.js';
import { Payment } from '../payments/payment.entity.js';
import { getActiveTenantContext } from '../tenant-context/tenant-context.js';
import { OrderStatusHistory } from '../workflow/order-status-history.entity.js';
import { getWorkflow } from '../workflow/workflow.config.js';
import type { CreateOrderDto, ListOrdersQueryDto } from './dto/order.dto.js';
import { LaundryOrderItem } from './laundry-order-item.entity.js';
import { LaundryOrder } from './laundry-order.entity.js';
import {
  calculateItemDiscount,
  calculateItemPrice,
  calculateOrderTotals,
  summarizePayments,
} from './pricing.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(LaundryOrder)
    private readonly ordersRepo: Repository<LaundryOrder>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    @InjectRepository(LaundryService)
    private readonly servicesRepo: Repository<LaundryService>,
  ) {}

  async list(query: ListOrdersQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.branch', 'branch')
      .leftJoinAndSelect('o.customer', 'customer')
      .leftJoinAndSelect('o.items', 'items')
      .where('o.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) {
      qb.andWhere('o.branchId = :branchId', { branchId });
    }
    if (query.paymentStatus) {
      qb.andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }
    if (query.search) {
      const p = toSafeLikeContain(query.search);
      qb.andWhere(
        `(o.orderNumber ILIKE :p ESCAPE '\\' OR customer.name ILIKE :p ESCAPE '\\' OR customer.phone ILIKE :p ESCAPE '\\')`,
        { p },
      );
    }

    const [items, total] = await qb
      .orderBy('o.receivedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }

  async getById(id: string, actor: LaundryAuthUser) {
    const order = await this.ordersRepo.findOne({
      where: { id, tenantId: actor.tenantId },
      relations: {
        branch: true,
        customer: true,
        cashier: true,
        items: true,
        payments: true,
      },
    });
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan');
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      order.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Anda tidak memiliki akses ke pesanan cabang lain');
    }
    return order;
  }

  async create(dto: CreateOrderDto, actor: LaundryAuthUser) {
    const branchId = requireActorWriteBranch(actor, dto.branchId);
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId, tenantId: actor.tenantId, isActive: true },
    });
    if (!branch) throw new BadRequestException('Cabang tidak ditemukan atau tidak aktif');

    return this.dataSource.transaction(async (manager) => {
      let customer: Customer | null = null;
      if (dto.customerId) {
        customer = await manager.findOne(Customer, {
          where: { id: dto.customerId, tenantId: actor.tenantId },
        });
        if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');
      } else if (dto.customerPhone && dto.customerName) {
        const cleanPhone = normalizeCustomerPhone(dto.customerPhone);
        if (!cleanPhone) {
          throw new BadRequestException(
            'Nomor WhatsApp pelanggan harus format 08... (11-13 digit)',
          );
        }
        customer = await manager.findOne(Customer, {
          where: { tenantId: actor.tenantId, phone: cleanPhone },
        });
        if (!customer) {
          customer = await manager.save(
            manager.create(Customer, {
              tenantId: actor.tenantId,
              name: dto.customerName,
              phone: cleanPhone,
            }),
          );
        }
      } else {
        throw new BadRequestException(
          'customerId atau (customerName + customerPhone) wajib diisi',
        );
      }

      const preparedItems: Array<{
        service: LaundryService;
        weightKg: number | null;
        garmentCount: number | null;
        quantity: number;
        itemTotal: number;
        discountAmount: number;
        initialStatus: ReturnType<typeof getWorkflow>['initialStatus'];
        notes: string | null;
      }> = [];

      let maxDurationHours = 0;

      for (const itemDto of dto.items) {
        const service = await manager.findOne(LaundryService, {
          where: { id: itemDto.serviceId, tenantId: actor.tenantId, isActive: true },
        });
        if (!service) {
          throw new NotFoundException('Layanan laundry tidak ditemukan atau nonaktif');
        }
        if (service.branchId && service.branchId !== branch.id) {
          throw new BadRequestException(
            `Layanan "${service.name}" bukan milik cabang ini`,
          );
        }

        const effectiveMinWeight =
          service.minWeightKg ?? branch.defaultMinWeightKg ?? null;

        const priced = calculateItemPrice({
          serviceName: service.name,
          priceUnit: service.priceUnit,
          unitPrice: Number(service.price),
          minWeightKg: effectiveMinWeight,
          weightKg: itemDto.weightKg,
          garmentCount: itemDto.garmentCount,
          quantity: itemDto.quantity,
        });

        const itemDisc = service.discountActive
          ? calculateItemDiscount(
              priced.itemTotal,
              service.discountType,
              Number(service.discountValue),
            )
          : 0;

        const wf = getWorkflow(service.workflow);
        if (
          service.estimatedDurationHours &&
          service.estimatedDurationHours > maxDurationHours
        ) {
          maxDurationHours = service.estimatedDurationHours;
        }

        preparedItems.push({
          service,
          weightKg: priced.weightKg,
          garmentCount: priced.garmentCount,
          quantity: priced.quantity,
          itemTotal: priced.itemTotal,
          discountAmount: itemDisc,
          initialStatus: wf.initialStatus,
          notes: itemDto.notes ?? null,
        });
      }

      const itemDiscountsTotal = sumMoney(preparedItems.map((i) => i.discountAmount));
      const orderDiscount = sumMoney([itemDiscountsTotal, dto.discount ?? 0]);
      const baseTotals = calculateOrderTotals(
        preparedItems.map((i) => i.itemTotal),
        orderDiscount,
      );

      const isPayLater = Boolean(dto.isPayLater);
      const payLaterFee = isPayLater ? Number(branch.payLaterFee || 0) : 0;
      const grandTotal = sumMoney([baseTotals.total, payLaterFee]);

      const initialPay = Number(dto.initialPaymentAmount || 0);
      if (compareMoney(initialPay, grandTotal) > 0) {
        throw new BadRequestException('Pembayaran awal melebihi total tagihan');
      }

      const paymentSummary = summarizePayments(
        grandTotal,
        initialPay > 0 ? [initialPay] : [],
      );

      const receivedAt = new Date();
      const estimatedCompletionAt =
        maxDurationHours > 0
          ? new Date(receivedAt.getTime() + maxDurationHours * 60 * 60 * 1000)
          : null;

      const order = await manager.save(
        manager.create(LaundryOrder, {
          tenantId: actor.tenantId,
          orderNumber: generateOrderNumber(branch.code),
          branchId: branch.id,
          customerId: customer.id,
          cashierStaffId: actor.id,
          receivedAt,
          estimatedCompletionAt,
          subtotal: baseTotals.subtotal,
          discount: baseTotals.discount,
          isPayLater,
          payLaterFee,
          total: grandTotal,
          paidAmount: paymentSummary.paidAmount,
          paymentStatus: paymentSummary.paymentStatus,
          notes: dto.notes ?? null,
        }),
      );

      for (const prep of preparedItems) {
        const orderItem = await manager.save(
          manager.create(LaundryOrderItem, {
            tenantId: actor.tenantId,
            orderId: order.id,
            serviceId: prep.service.id,
            serviceName: prep.service.name,
            workflow: prep.service.workflow,
            priceUnit: prep.service.priceUnit,
            unitPrice: Number(prep.service.price),
            weightKg: prep.weightKg,
            garmentCount: prep.garmentCount,
            quantity: prep.quantity,
            itemTotal: prep.itemTotal,
            discountAmount: prep.discountAmount,
            status: prep.initialStatus,
            notes: prep.notes,
          }),
        );

        await manager.save(
          manager.create(OrderStatusHistory, {
            tenantId: actor.tenantId,
            orderItemId: orderItem.id,
            fromStatus: null,
            toStatus: prep.initialStatus,
            changedByStaffId: actor.id,
            notes: 'Order dibuat di kasir',
          }),
        );
      }

      if (initialPay > 0) {
        await manager.save(
          manager.create(Payment, {
            tenantId: actor.tenantId,
            orderId: order.id,
            branchId: branch.id,
            cashierStaffId: actor.id,
            amount: initialPay,
            method: dto.initialPaymentMethod ?? PaymentMethod.CASH,
            status: PaymentStatus.SUCCESS,
            paidAt: receivedAt,
            notes: 'Pembayaran saat pembuatan order',
          }),
        );
      }

      return this.getById(order.id, actor);
    });
  }

  async markPickedUp(id: string, actor: LaundryAuthUser) {
    const order = await this.getById(id, actor);
    if (order.pickedUpAt) {
      throw new BadRequestException('Pesanan ini sudah diambil oleh pelanggan');
    }
    const notDone = order.items.some((item) => item.status !== 'SELESAI');
    if (notDone) {
      throw new BadRequestException(
        'Semua item harus berstatus SELESAI sebelum diambil pelanggan',
      );
    }
    if (order.paymentStatus !== OrderPaymentStatus.PAID) {
      throw new BadRequestException(
        'Pesanan belum lunas. Lunasi pembayaran sebelum penyerahan pakaian.',
      );
    }

    order.pickedUpAt = new Date();
    order.pickedUpByStaffId = actor.id;
    return this.ordersRepo.save(order);
  }

  async buildReceipt(id: string, actor: LaundryAuthUser) {
    const order = await this.getById(id, actor);
    const activeCtx = getActiveTenantContext();
    const storeName = activeCtx?.brandName
      ? `${activeCtx.brandName} — ${order.branch.name}`
      : order.branch.name;

    const lines = [
      `*${storeName}*`,
      `Nota: *${order.orderNumber}*`,
      `Pelanggan: ${order.customer.name}`,
      `Tanggal: ${order.receivedAt.toLocaleString('id-ID')}`,
      '',
      '*Rincian Layanan:*',
      ...order.items.map(
        (item) =>
          `- ${item.serviceName} (${item.quantity} ${item.priceUnit}) = Rp${Number(item.itemTotal).toLocaleString('id-ID')} [${ITEM_STATUS_LABELS[item.status]}]`,
      ),
      '',
      `Total: *Rp${Number(order.total).toLocaleString('id-ID')}*`,
      `Dibayar: Rp${Number(order.paidAmount).toLocaleString('id-ID')} (${order.paymentStatus})`,
    ];

    const whatsappText = lines.join('\n');
    const cleanPhone = order.customer.phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappText)}`;

    return {
      store: {
        name: storeName,
        address: order.branch.address || '',
        phone: order.branch.phone || order.branch.whatsappNumber || '',
      },
      order,
      whatsappText,
      whatsappUrl,
    };
  }
}
