import {
  BadRequestException,
  ConflictException,
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
  ItemStatus,
  OrderPaymentStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '../common/enums.js';
import {
  compareMoney,
  subtractMoney,
  sumMoney,
} from '../common/utils/money.js';
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

  private enrichOrder(order: LaundryOrder) {
    const remainingAmount = Math.max(
      0,
      subtractMoney(Number(order.total || 0), Number(order.paidAmount || 0)),
    );
    const items = (order.items || []).map((item) =>
      Object.assign(item, {
        ironingEmployee: item.ironingStaff ?? null,
        ironingEmployeeId: item.ironingStaffId ?? null,
      }),
    );
    return Object.assign(order, { remainingAmount, items });
  }

  async list(query: ListOrdersQueryDto, actor: LaundryAuthUser) {
    const branchId = resolveActorBranchScope(actor, query.branchId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.branch', 'branch')
      .leftJoinAndSelect('o.customer', 'customer')
      .leftJoinAndSelect('o.cashier', 'cashier')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.ironingStaff', 'ironingStaff')
      .leftJoinAndSelect('o.payments', 'payments')
      .where('o.tenantId = :tenantId', { tenantId: actor.tenantId });

    if (branchId) {
      qb.andWhere('o.branchId = :branchId', { branchId });
    }
    if (query.paymentStatus) {
      qb.andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }
    if (query.itemStatus) {
      qb.andWhere('items.status = :itemStatus', {
        itemStatus: query.itemStatus,
      });
    }
    if (query.customerId) {
      qb.andWhere('o.customerId = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.pickedUp !== undefined) {
      if (query.pickedUp) qb.andWhere('o.pickedUpAt IS NOT NULL');
      else qb.andWhere('o.pickedUpAt IS NULL');
    }
    if (query.from) {
      const fromStr = query.from.includes('T')
        ? query.from
        : `${query.from}T00:00:00+07:00`;
      qb.andWhere('o.receivedAt >= :from', { from: fromStr });
    }
    if (query.to) {
      const toStr = query.to.includes('T')
        ? query.to
        : `${query.to}T23:59:59.999+07:00`;
      qb.andWhere('o.receivedAt <= :to', { to: toStr });
    }
    const rawSearch = (query.q || query.search || '').trim();
    if (rawSearch) {
      const p = toSafeLikeContain(rawSearch);
      qb.andWhere(
        `(o.orderNumber ILIKE :p ESCAPE '\\' OR customer.name ILIKE :p ESCAPE '\\' OR customer.phone ILIKE :p ESCAPE '\\')`,
        { p },
      );
    }

    const [rawItems, total] = await qb
      .orderBy('o.receivedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = rawItems.map((o) => this.enrichOrder(o));
    return { data, items: data, total, page, limit };
  }

  async getById(id: string, actor: LaundryAuthUser) {
    const order = await this.ordersRepo.findOne({
      where: { id, tenantId: actor.tenantId },
      relations: {
        branch: true,
        customer: true,
        cashier: true,
        items: { ironingStaff: true },
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
    return this.enrichOrder(order);
  }

  async create(dto: CreateOrderDto, actor: LaundryAuthUser) {
    let branchId: string | null = null;
    try {
      branchId = requireActorWriteBranch(actor, dto.branchId);
    } catch {
      const mainBranch = await this.branchesRepo.findOne({
        where: { tenantId: actor.tenantId, isActive: true },
        order: { isMain: 'DESC', createdAt: 'ASC' },
      });
      branchId = mainBranch?.id ?? null;
    }
    if (!branchId) {
      throw new BadRequestException('Cabang tidak ditemukan atau tidak aktif');
    }
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId, tenantId: actor.tenantId, isActive: true },
    });
    if (!branch) throw new BadRequestException('Cabang tidak ditemukan atau tidak aktif');

    return this.dataSource.transaction(async (manager) => {
      let customer: Customer | null = null;
      const custName = dto.customer?.name || dto.customerName;
      const custPhone = dto.customer?.phone || dto.customerPhone;
      const custAddress = dto.customer?.address ?? null;
      const custNotes = dto.customer?.notes ?? null;

      if (dto.customerId) {
        customer = await manager.findOne(Customer, {
          where: { id: dto.customerId, tenantId: actor.tenantId },
        });
        if (!customer) throw new NotFoundException('Pelanggan tidak ditemukan');
      } else if (custPhone && custName) {
        const cleanPhone = normalizeCustomerPhone(custPhone);
        if (!cleanPhone) {
          throw new BadRequestException(
            'Nomor WhatsApp pelanggan harus format 08... (11-13 digit)',
          );
        }
        customer = await manager.findOne(Customer, {
          where: { tenantId: actor.tenantId, phone: cleanPhone },
        });
        if (customer) {
          customer.name = custName;
          if (custAddress) customer.address = custAddress;
          if (custNotes) customer.notes = custNotes;
          customer = await manager.save(customer);
        } else {
          customer = await manager.save(
            manager.create(Customer, {
              tenantId: actor.tenantId,
              name: custName,
              phone: cleanPhone,
              address: custAddress,
              notes: custNotes,
            }),
          );
        }
      } else {
        throw new BadRequestException(
          'Pilih customer yang sudah ada atau isi data customer baru',
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

      const initialPay = isPayLater
        ? 0
        : Number(dto.initialPayment?.amount ?? dto.initialPaymentAmount ?? 0);
      const initialPayMethod =
        dto.initialPayment?.method ??
        dto.initialPaymentMethod ??
        PaymentMethod.CASH;

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
            method: initialPayMethod,
            status: PaymentStatus.SUCCESS,
            reference: dto.initialPayment?.reference ?? null,
            paidAt: receivedAt,
            notes: dto.initialPayment?.notes || 'Pembayaran saat pembuatan order',
          }),
        );
      }

      return this.getById(order.id, actor);
    });
  }

  async markPickedUp(id: string, actor: LaundryAuthUser) {
    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(LaundryOrder);
      const itemRepo = manager.getRepository(LaundryOrderItem);
      const historyRepo = manager.getRepository(OrderStatusHistory);

      const order = await orderRepo.findOne({
        where: { id, tenantId: actor.tenantId },
        relations: { items: true },
      });
      if (!order) throw new NotFoundException('Pesanan tidak ditemukan');
      if (
        actor.role !== UserRole.SUPER_OWNER &&
        order.branchId !== actor.branchId
      ) {
        throw new ForbiddenException('Pesanan tidak berasal dari cabang Anda');
      }
      if (order.pickedUpAt) {
        throw new ConflictException('Pesanan sudah pernah diambil sebelumnya');
      }
      if (
        order.paymentStatus !== OrderPaymentStatus.PAID &&
        Number(order.paidAmount) < Number(order.total)
      ) {
        throw new BadRequestException(
          'Pesanan belum lunas. Lunasi pembayaran sebelum penyerahan pakaian.',
        );
      }

      const allReadyForPickup = order.items.every(
        (i) =>
          i.status === ItemStatus.SELESAI ||
          i.status === ItemStatus.SETRIKA_SELESAI,
      );
      if (!allReadyForPickup) {
        throw new BadRequestException(
          'Semua layanan dalam pesanan harus minimal selesai disetrika (SETRIKA_SELESAI) atau SELESAI sebelum diambil pelanggan',
        );
      }

      const now = new Date();
      for (const item of order.items) {
        if (item.status !== ItemStatus.SELESAI) {
          const prevStatus = item.status;
          item.status = ItemStatus.SELESAI;
          item.completedAt = now;
          await itemRepo.save(item);
          await historyRepo.save(
            historyRepo.create({
              tenantId: actor.tenantId,
              orderItemId: item.id,
              fromStatus: prevStatus,
              toStatus: ItemStatus.SELESAI,
              changedByStaffId: actor.id,
              notes:
                'Langsung diambil pelanggan setelah selesai setrika (tanpa input nomor rak)',
            }),
          );
        }
      }

      order.pickedUpAt = now;
      order.pickedUpByStaffId = actor.id;
      await orderRepo.save(order);
    });

    return this.getById(id, actor);
  }

  async buildReceipt(id: string, actor: LaundryAuthUser) {
    const order = await this.getById(id, actor);
    const activeCtx = getActiveTenantContext();
    const storeName =
      order.branch?.name ||
      activeCtx?.brandName ||
      'Luminous Laundry';
    const storeAddress =
      order.branch?.address ||
      'Jl. Karang Menjangan 3F No. 2, Surabaya Timur';
    const storePhone =
      order.branch?.whatsappNumber ||
      order.branch?.phone ||
      activeCtx?.whatsappPhone ||
      '0812-3456-7890';

    const lines: string[] = [
      `*${storeName}*`,
      storeAddress,
      `Telp/WA: ${storePhone}`,
      `--------------------------------`,
      `No. Nota : *${order.orderNumber}*`,
      `Cabang   : ${order.branch?.name || '-'}`,
      `Pelanggan: ${order.customer.name}`,
      `Kasir    : ${order.cashier?.name || '-'}`,
      `Tanggal  : ${order.receivedAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      `--------------------------------`,
    ];

    for (const item of order.items) {
      const unitLabel =
        item.priceUnit === 'KG'
          ? `${item.quantity} kg`
          : `${item.quantity} pcs`;
      lines.push(
        `• *${item.serviceName}* (${unitLabel} x Rp${Number(item.unitPrice).toLocaleString('id-ID')}) = *Rp${Number(item.itemTotal).toLocaleString('id-ID')}*`,
      );
      lines.push(
        `  Status: ${ITEM_STATUS_LABELS[item.status]}${item.rackNumber ? ` | Rak: ${item.rackNumber}` : ''}`,
      );
    }

    lines.push(`--------------------------------`);
    lines.push(`Subtotal : Rp${Number(order.subtotal).toLocaleString('id-ID')}`);
    if (Number(order.discount) > 0) {
      lines.push(`Diskon   : -Rp${Number(order.discount).toLocaleString('id-ID')}`);
    }
    if (Number(order.payLaterFee) > 0) {
      lines.push(
        `Charge Bayar Nanti: +Rp${Number(order.payLaterFee).toLocaleString('id-ID')}`,
      );
    }
    lines.push(`*Total    : Rp${Number(order.total).toLocaleString('id-ID')}*`);
    lines.push(`Dibayar  : Rp${Number(order.paidAmount).toLocaleString('id-ID')}`);
    lines.push(
      `Sisa     : Rp${Number(order.remainingAmount).toLocaleString('id-ID')} (${order.paymentStatus})`,
    );
    lines.push(`--------------------------------`);
    const trackingUrl = this.buildBranchTrackingUrl(
      activeCtx?.tenantSlug,
      activeCtx?.brandName,
      order.branch,
    );
    if (trackingUrl) {
      lines.push(
        `Cek status cucian Anda (ketik nama / no. nota) di:`,
        trackingUrl,
        `Simpan struk ini untuk pengambilan pakaian.`,
      );
    } else {
      lines.push(
        `Cek status cucian cukup ketik *nama Anda* di halaman Lacak kami. Simpan struk ini untuk pengambilan pakaian.`,
      );
    }

    const whatsappText = lines.join('\n');
    const cleanPhone = order.customer.phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappText)}`;

    return {
      store: {
        name: storeName,
        address: storeAddress,
        phone: storePhone,
      },
      order,
      whatsappText,
      whatsappUrl,
      trackingUrl,
    };
  }

  /**
   * Link cek nota per cabang, contoh: https://baguslaundry.mnilab.my.id/pusat
   * Slug cabang harus identik dengan getBranchSlug() di frontend.
   * Untuk lokal set LAUNDRY_PUBLIC_WEB_URL (mis. http://localhost:3002) → /pusat?tenant=slug
   */
  private buildBranchTrackingUrl(
    tenantSlug: string | undefined,
    brandName: string | undefined,
    branch: { name?: string | null; code?: string | null; isMain?: boolean } | null | undefined,
  ): string | null {
    if (!tenantSlug || !branch) return null;
    const slugify = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    let cleanName = branch.name || branch.code || 'pusat';
    if (brandName) {
      const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleanName = cleanName.replace(new RegExp(`^${escaped}\\s*[—\\-•:]?\\s*`, 'i'), '');
    }
    cleanName = cleanName.replace(/^lumi[eè]re\s+atelier\s*[—\-•:]?\s*/i, '');
    const branchSlug =
      slugify(cleanName) || (branch.isMain ? 'pusat' : slugify(branch.code || 'cabang'));

    const localBase = process.env.LAUNDRY_PUBLIC_WEB_URL?.trim().replace(/\/$/, '');
    if (localBase) {
      return `${localBase}/${branchSlug}?tenant=${encodeURIComponent(tenantSlug)}`;
    }
    const domain = (process.env.PUBLIC_MAIN_DOMAIN?.trim() || 'mnilab.my.id').toLowerCase();
    const subdomain = tenantSlug === 'demo-laundry' ? 'demo' : tenantSlug.toLowerCase();
    return `https://${subdomain}.${domain}/${branchSlug}`;
  }
}
