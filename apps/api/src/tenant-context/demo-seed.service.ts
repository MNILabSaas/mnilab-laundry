import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import {
  ExpenseApprovalStatus,
  ItemStatus,
  OrderPaymentStatus,
  PaymentMethod,
  PaymentStatus,
  PriceUnit,
  UserRole,
  WorkflowCode,
} from '../common/enums.js';
import { Customer } from '../customers/customer.entity.js';
import { ExpenseCategory } from '../expenses/expense-category.entity.js';
import { Expense } from '../expenses/expense.entity.js';
import { LaundryService } from '../laundry-services/laundry-service.entity.js';
import { LaundryOrderItem } from '../orders/laundry-order-item.entity.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { Payment } from '../payments/payment.entity.js';
import { PlatformClientService } from '../platform/platform-client.service.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import {
  DEFAULT_LAUNDRY_THEME,
  TenantProfile,
} from './tenant-profile.entity.js';

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);
  private readonly seededDemoTenants = new Set<string>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly platformClient: PlatformClientService,
  ) {}

  async ensureDemoSeededBySlug(forceReset = false): Promise<{ tenantId: string }> {
    const resolved = await this.platformClient.resolveTenantBySlug('demo-laundry');
    await this.ensureDemoSeeded(resolved.tenant.id, forceReset);
    return { tenantId: resolved.tenant.id };
  }

  async ensureDemoSeeded(tenantId: string, forceReset = false): Promise<void> {
    if (!forceReset && this.seededDemoTenants.has(tenantId)) {
      return;
    }

    await this.dataSource.transaction(async (mgr) => {
      const branchRepo = mgr.getRepository(Branch);
      const staffRepo = mgr.getRepository(LaundryStaff);
      const custRepo = mgr.getRepository(Customer);
      const svcRepo = mgr.getRepository(LaundryService);
      const catRepo = mgr.getRepository(ExpenseCategory);
      const expRepo = mgr.getRepository(Expense);
      const orderRepo = mgr.getRepository(LaundryOrder);
      const itemRepo = mgr.getRepository(LaundryOrderItem);
      const payRepo = mgr.getRepository(Payment);

      if (forceReset) {
        await mgr.query(`DELETE FROM "payments" WHERE "tenant_id" = $1`, [tenantId]);
        await mgr.query(
          `DELETE FROM "order_status_history" WHERE "tenant_id" = $1`,
          [tenantId],
        );
        await mgr.query(
          `DELETE FROM "laundry_order_items" WHERE "tenant_id" = $1`,
          [tenantId],
        );
        await mgr.query(`DELETE FROM "laundry_orders" WHERE "tenant_id" = $1`, [
          tenantId,
        ]);
        await mgr.query(`DELETE FROM "expenses" WHERE "tenant_id" = $1`, [
          tenantId,
        ]);
        await mgr.query(`DELETE FROM "customers" WHERE "tenant_id" = $1`, [
          tenantId,
        ]);
      }

      // 1. Pastikan 2 Cabang Demo
      let mainBranch = await branchRepo.findOne({
        where: { tenantId, code: 'LUM-01' },
      });
      if (!mainBranch) {
        mainBranch = await branchRepo.save(
          branchRepo.create({
            tenantId,
            name: 'Cabang Pusat (Senopati)',
            code: 'LUM-01',
            address: 'Jl. Senopati Raya No. 88, Jakarta Selatan',
            phone: '081299998888',
            whatsappNumber: '081299998888',
            ironingRate: 1200,
            openTime: '07:30',
            closeTime: '21:00',
            defaultMinWeightKg: 3,
            payLaterFee: 1000,
            attendanceRadiusMeters: 20,
            isMain: true,
            isActive: true,
          }),
        );
      }

      let secondBranch = await branchRepo.findOne({
        where: { tenantId, code: 'LUM-02' },
      });
      if (!secondBranch) {
        secondBranch = await branchRepo.save(
          branchRepo.create({
            tenantId,
            name: 'Cabang Dharmawangsa',
            code: 'LUM-02',
            address: 'Jl. Dharmawangsa VI No. 14, Jakarta Selatan',
            phone: '081299997777',
            whatsappNumber: '081299997777',
            ironingRate: 1200,
            openTime: '08:00',
            closeTime: '21:00',
            defaultMinWeightKg: 3,
            payLaterFee: 1000,
            attendanceRadiusMeters: 20,
            isMain: false,
            isActive: true,
          }),
        );
      }

      // 2. Pastikan 5 Akun Demo (Super Owner, Branch Owner, Kasir, Setrika, Cuci)
      const demoStaffDefs: Array<{
        name: string;
        email: string;
        phone: string;
        role: UserRole;
        branchId: string | null;
      }> = [
        {
          name: 'Alexander Wijaya (Demo Super Owner)',
          email: 'demo@mnilab.local',
          phone: '081299998888',
          role: UserRole.SUPER_OWNER,
          branchId: mainBranch.id,
        },
        {
          name: 'Rizky Pratama (Demo Branch Owner)',
          email: 'branchowner.demo@mnilab.local',
          phone: '081299998800',
          role: UserRole.BRANCH_OWNER,
          branchId: mainBranch.id,
        },
        {
          name: 'Nadia Putri (Kasir Demo)',
          email: 'kasir.demo@mnilab.local',
          phone: '081299998801',
          role: UserRole.CASHIER,
          branchId: mainBranch.id,
        },
        {
          name: 'Siti Rahmawati (Petugas Setrika)',
          email: 'setrika.demo@mnilab.local',
          phone: '081299998802',
          role: UserRole.IRONING,
          branchId: mainBranch.id,
        },
        {
          name: 'Bima Pratama (Petugas Cuci)',
          email: 'cuci.demo@mnilab.local',
          phone: '081299998803',
          role: UserRole.WASHING,
          branchId: mainBranch.id,
        },
      ];

      const staffByEmail = new Map<string, LaundryStaff>();
      for (const def of demoStaffDefs) {
        let st = await staffRepo.findOne({
          where: { tenantId, email: def.email },
        });
        if (!st) {
          st = await staffRepo.save(
            staffRepo.create({
              tenantId,
              platformUserId: randomUUID(),
              branchId: def.branchId,
              name: def.name,
              email: def.email,
              phone: def.phone,
              role: def.role,
              isActive: true,
            }),
          );
        } else if (st.role !== def.role || !st.branchId || !st.isActive) {
          st.name = def.name;
          st.role = def.role;
          st.branchId = def.branchId;
          st.isActive = true;
          st = await staffRepo.save(st);
        }
        staffByEmail.set(def.email, st);
      }

      const demoOwner = staffByEmail.get('demo@mnilab.local')!;
      const demoCashier = staffByEmail.get('kasir.demo@mnilab.local')!;
      const demoIroner = staffByEmail.get('setrika.demo@mnilab.local')!;

      // 3. Pastikan 4 Layanan Laundry Demo Lengkap
      let services = await svcRepo.find({ where: { tenantId } });
      if (services.length === 0) {
        const defaultServices = [
          {
            name: 'Cuci Kering Setrika Uap Signature',
            description:
              'Proses 1 mesin 1 pelanggan, deterjen ramah serat, dan setrika uap rapi dengan parfum eksklusif.',
            workflow: WorkflowCode.WASH_IRON,
            priceUnit: PriceUnit.KG,
            price: 9000,
            minWeightKg: 3,
            estimatedDurationHours: 48,
          },
          {
            name: 'Cuci Kering Lipat Express',
            description:
              'Pencucian higienis dan pengeringan sempurna, dilipat presisi siap masuk lemari.',
            workflow: WorkflowCode.WASH_DRY,
            priceUnit: PriceUnit.KG,
            price: 7000,
            minWeightKg: 3,
            estimatedDurationHours: 24,
          },
          {
            name: 'Setrika Uap Atelier Saja',
            description:
              'Layanan khusus setrika uap boiler dan finishing parfum premium.',
            workflow: WorkflowCode.IRON_ONLY,
            priceUnit: PriceUnit.KG,
            price: 5500,
            minWeightKg: 3,
            estimatedDurationHours: 24,
          },
          {
            name: 'Perawatan Satuan Jas & Bedcover King',
            description:
              'Penanganan khusus per potong untuk jas formal, gaun malam, dan bedcover ukuran besar.',
            workflow: WorkflowCode.WASH_IRON_ITEM,
            priceUnit: PriceUnit.ITEM,
            price: 35000,
            minWeightKg: null,
            estimatedDurationHours: 48,
          },
        ];
        services = [];
        for (const s of defaultServices) {
          services.push(
            await svcRepo.save(
              svcRepo.create({
                tenantId,
                branchId: null,
                ...s,
                discountType: 'NONE',
                discountValue: 0,
                discountActive: false,
                isThirdParty: false,
                isActive: true,
              }),
            ),
          );
        }
      }

      // 4. Kategori Pengeluaran
      let cats = await catRepo.find({ where: { tenantId } });
      if (cats.length === 0) {
        cats = await catRepo.save([
          catRepo.create({
            tenantId,
            name: 'Parfum & Deterjen Premium',
            description: 'Bahan baku pencucian dan pewangi',
            isActive: true,
          }),
          catRepo.create({
            tenantId,
            name: 'Utilitas Listrik & Gas Boiler',
            description: 'Operasional mesin pengering & setrika uap',
            isActive: true,
          }),
          catRepo.create({
            tenantId,
            name: 'Kemasan & Hanger Eksklusif',
            description: 'Plastik garment, hanger, dan kertas struk',
            isActive: true,
          }),
        ]);
      }

      // 5. Pelanggan, Pesanan & Pembayaran Dummy
      const orderCount = await orderRepo.count({ where: { tenantId } });
      if (orderCount === 0 && services.length > 0) {
        const c1 = await custRepo.save(
          custRepo.create({
            tenantId,
            name: 'Raden Ajeng Kartika (Dummy)',
            phone: '081100001001',
            address: 'Jl. Tulodong Atas No. 12, Senopati',
            notes: 'Parfum aroma White Tea',
          }),
        );
        const c2 = await custRepo.save(
          custRepo.create({
            tenantId,
            name: 'Bpk. Hendra Kusuma (Dummy)',
            phone: '081100001002',
            address: 'Apartemen Senopati Suites Tower B',
            notes: 'Lipat rapi tanpa gantungan',
          }),
        );
        const c3 = await custRepo.save(
          custRepo.create({
            tenantId,
            name: 'Ibu Clarissa Tan (Dummy)',
            phone: '081100001003',
            address: 'Jl. Dharmawangsa VIII No. 5',
            notes: 'Pelanggan rutin mingguan',
          }),
        );

        const now = new Date();
        const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const estTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const svcWashIron = services[0];
        const svcWashDry = services[1] || services[0];
        const svcItem = services[3] || services[0];

        // Order 1
        const ord1 = await orderRepo.save(
          orderRepo.create({
            tenantId,
            orderNumber: 'LDR-DEMO-1001',
            branchId: mainBranch.id,
            customerId: c1.id,
            cashierStaffId: demoCashier.id,
            receivedAt: now,
            estimatedCompletionAt: estTomorrow,
            subtotal: 80000,
            discount: 0,
            isPayLater: false,
            payLaterFee: 0,
            total: 80000,
            paidAmount: 80000,
            paymentStatus: OrderPaymentStatus.PAID,
            notes: 'Contoh pesanan aktif dengan 2 item cucian sedang diproses.',
          }),
        );

        await itemRepo.save([
          itemRepo.create({
            tenantId,
            orderId: ord1.id,
            serviceId: svcWashIron.id,
            serviceName: svcWashIron.name,
            workflow: svcWashIron.workflow,
            priceUnit: svcWashIron.priceUnit,
            unitPrice: svcWashIron.price,
            weightKg: 5,
            garmentCount: 18,
            quantity: 5,
            itemTotal: 45000,
            discountAmount: 0,
            status: ItemStatus.PROSES_SETRIKA,
            ironingStaffId: demoIroner.id,
            ironingStartedAt: now,
            ironingRate: 1200,
            ironingWage: 6000,
            notes: 'Kemeja kerja & blus',
          }),
          itemRepo.create({
            tenantId,
            orderId: ord1.id,
            serviceId: svcItem.id,
            serviceName: svcItem.name,
            workflow: svcItem.workflow,
            priceUnit: svcItem.priceUnit,
            unitPrice: 35000,
            weightKg: null,
            garmentCount: 1,
            quantity: 1,
            itemTotal: 35000,
            discountAmount: 0,
            status: ItemStatus.PROSES_CUCI,
            notes: 'Bedcover King Putih',
          }),
        ]);

        await payRepo.save(
          payRepo.create({
            tenantId,
            orderId: ord1.id,
            branchId: mainBranch.id,
            cashierStaffId: demoCashier.id,
            amount: 80000,
            method: PaymentMethod.QRIS,
            status: PaymentStatus.SUCCESS,
            paidAt: now,
            notes: 'Pembayaran QRIS Lunas (Data Demo)',
          }),
        );

        // Order 2
        const ord2 = await orderRepo.save(
          orderRepo.create({
            tenantId,
            orderNumber: 'LDR-DEMO-1002',
            branchId: mainBranch.id,
            customerId: c2.id,
            cashierStaffId: demoCashier.id,
            receivedAt: now,
            estimatedCompletionAt: estTomorrow,
            subtotal: 54000,
            discount: 0,
            isPayLater: false,
            payLaterFee: 0,
            total: 54000,
            paidAmount: 54000,
            paymentStatus: OrderPaymentStatus.PAID,
            notes: 'Siap masuk rak penyimpanan.',
          }),
        );

        await itemRepo.save(
          itemRepo.create({
            tenantId,
            orderId: ord2.id,
            serviceId: svcWashIron.id,
            serviceName: svcWashIron.name,
            workflow: svcWashIron.workflow,
            priceUnit: svcWashIron.priceUnit,
            unitPrice: svcWashIron.price,
            weightKg: 6,
            garmentCount: 22,
            quantity: 6,
            itemTotal: 54000,
            discountAmount: 0,
            status: ItemStatus.SETRIKA_SELESAI,
            ironingStaffId: demoIroner.id,
            ironingStartedAt: now,
            ironingCompletedAt: now,
            ironingRate: 1200,
            ironingWage: 7200,
            notes: 'Sudah selesai disetrika uap',
          }),
        );

        await payRepo.save(
          payRepo.create({
            tenantId,
            orderId: ord2.id,
            branchId: mainBranch.id,
            cashierStaffId: demoCashier.id,
            amount: 54000,
            method: PaymentMethod.CASH,
            status: PaymentStatus.SUCCESS,
            paidAt: now,
            notes: 'Pembayaran Tunai Lunas (Data Demo)',
          }),
        );

        // Order 3: Selesai di Rak A-02 Cabang Dharmawangsa
        const ord3 = await orderRepo.save(
          orderRepo.create({
            tenantId,
            orderNumber: 'LDR-DEMO-1003',
            branchId: secondBranch.id,
            customerId: c3.id,
            cashierStaffId: demoOwner.id,
            receivedAt: now,
            estimatedCompletionAt: estTomorrow,
            subtotal: 49000,
            discount: 0,
            isPayLater: false,
            payLaterFee: 0,
            total: 49000,
            paidAmount: 49000,
            paymentStatus: OrderPaymentStatus.PAID,
            notes: 'Rak A-02 Cabang Dharmawangsa',
          }),
        );

        await itemRepo.save(
          itemRepo.create({
            tenantId,
            orderId: ord3.id,
            serviceId: svcWashDry.id,
            serviceName: svcWashDry.name,
            workflow: svcWashDry.workflow,
            priceUnit: svcWashDry.priceUnit,
            unitPrice: svcWashDry.price,
            weightKg: 7,
            garmentCount: 25,
            quantity: 7,
            itemTotal: 49000,
            discountAmount: 0,
            status: ItemStatus.SELESAI,
            rackNumber: 'A-02',
            rackAssignedByStaffId: demoOwner.id,
            rackAssignedAt: now,
            completedAt: now,
          }),
        );

        await payRepo.save(
          payRepo.create({
            tenantId,
            orderId: ord3.id,
            branchId: secondBranch.id,
            cashierStaffId: demoOwner.id,
            amount: 49000,
            method: PaymentMethod.CASH,
            status: PaymentStatus.SUCCESS,
            paidAt: now,
            notes: 'Pembayaran Tunai Cabang Dharmawangsa',
          }),
        );

        if (cats.length > 0) {
          await expRepo.save(
            expRepo.create({
              tenantId,
              branchId: mainBranch.id,
              categoryId: cats[0].id,
              recordedByStaffId: demoCashier.id,
              description: 'Pembelian Parfum Grade A 5 Liter (Data Demo)',
              amount: 35000,
              expenseDate: todayDateStr,
              paymentMethod: PaymentMethod.CASH,
              approvalStatus: ExpenseApprovalStatus.APPROVED,
              approvedByStaffId: demoOwner.id,
              approvedAt: now,
              notes: 'Contoh pengeluaran yang telah disetujui Owner',
            }),
          );
        }
      }
    });

    this.seededDemoTenants.add(tenantId);
  }

  async provisionPartnerTenant(params: {
    tenant: {
      id: string;
      slug: string;
      brandName: string;
      tagline?: string;
      logoUrl?: string | null;
      theme?: Record<string, string>;
      whatsappPhone?: string | null;
      isDemo?: boolean;
    };
    maxBranches?: number;
    owner: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
    };
  }) {
    const tenantId = params.tenant.id;
    await this.dataSource.transaction(async (mgr) => {
      const profileRepo = mgr.getRepository(TenantProfile);
      const staffRepo = mgr.getRepository(LaundryStaff);
      const catRepo = mgr.getRepository(ExpenseCategory);
      const svcRepo = mgr.getRepository(LaundryService);

      await profileRepo.upsert(
        {
          tenantId,
          slug: params.tenant.slug,
          brandName: params.tenant.brandName,
          tagline: params.tenant.tagline || 'The Best Partner in Laundry Service',
          logoUrl: params.tenant.logoUrl ?? null,
          themeConfigJson:
            (params.tenant.theme as unknown as typeof DEFAULT_LAUNDRY_THEME) ??
            DEFAULT_LAUNDRY_THEME,
          whatsappPhone: params.tenant.whatsappPhone ?? null,
          isDemo: Boolean(params.tenant.isDemo),
          subscriptionStatus: 'ACTIVE',
          maxBranches: params.maxBranches ?? 3,
          syncedAt: new Date(),
        },
        ['tenantId'],
      );

      let ownerStaff = await staffRepo.findOne({
        where: [
          { tenantId, platformUserId: params.owner.id },
          ...(params.owner.email ? [{ tenantId, email: params.owner.email }] : []),
        ],
      });
      if (!ownerStaff) {
        await staffRepo.save(
          staffRepo.create({
            tenantId,
            platformUserId: params.owner.id,
            branchId: null,
            name: params.owner.name,
            email: params.owner.email,
            phone: params.owner.phone,
            role: UserRole.SUPER_OWNER,
            isActive: true,
          }),
        );
      } else {
        ownerStaff.platformUserId = params.owner.id;
        ownerStaff.name = params.owner.name;
        ownerStaff.email = params.owner.email;
        ownerStaff.phone = params.owner.phone;
        ownerStaff.role = UserRole.SUPER_OWNER;
        ownerStaff.isActive = true;
        await staffRepo.save(ownerStaff);
      }

      const catCount = await catRepo.count({ where: { tenantId } });
      if (catCount === 0) {
        const defaultCategories = [
          { name: 'Deterjen & Pewangi', description: 'Sabun cuci, softener, parfum laundry' },
          { name: 'Listrik, Air & Gas', description: 'Tagihan utilitas bulanan dan tabung gas' },
          { name: 'Plastik & Kemasan', description: 'Plastik packing, hanger, lakban, kertas nota' },
          { name: 'Perawatan Mesin', description: 'Servis mesin cuci, pengering, dan setrika uap' },
          { name: 'Operasional Harian', description: 'Kebutuhan operasional outlet sehari-hari' },
        ];
        for (const c of defaultCategories) {
          await catRepo.save(catRepo.create({ tenantId, ...c, isActive: true }));
        }
      }

      const svcCount = await svcRepo.count({ where: { tenantId } });
      if (svcCount === 0) {
        const defaultServices = [
          {
            name: 'Cuci Kering Setrika',
            description: 'Cuci bersih higienis, dikeringkan mesin, dan disetrika uap rapi.',
            workflow: WorkflowCode.WASH_IRON,
            priceUnit: PriceUnit.KG,
            price: 7000,
            minWeightKg: 3,
            estimatedDurationHours: 48,
          },
          {
            name: 'Cuci Kering Lipat',
            description: 'Pakaian dicuci bersih, dikeringkan penuh, dan dilipat rapi.',
            workflow: WorkflowCode.WASH_DRY,
            priceUnit: PriceUnit.KG,
            price: 5500,
            minWeightKg: 3,
            estimatedDurationHours: 24,
          },
          {
            name: 'Setrika Uap Saja',
            description: 'Layanan setrika uap rapi dan parfum untuk pakaian bersih.',
            workflow: WorkflowCode.IRON_ONLY,
            priceUnit: PriceUnit.KG,
            price: 4500,
            minWeightKg: 3,
            estimatedDurationHours: 24,
          },
          {
            name: 'Cuci Satuan & Bedcover',
            description: 'Penanganan khusus per potong untuk bedcover, selimut, dan jas.',
            workflow: WorkflowCode.WASH_IRON_ITEM,
            priceUnit: PriceUnit.ITEM,
            price: 25000,
            minWeightKg: null,
            estimatedDurationHours: 48,
          },
        ];
        for (const s of defaultServices) {
          await svcRepo.save(
            svcRepo.create({
              tenantId,
              branchId: null,
              ...s,
              discountType: 'NONE',
              discountValue: 0,
              discountActive: false,
              isThirdParty: false,
              isActive: true,
            }),
          );
        }
      }
    });

    this.platformClient.invalidateTenantCache(tenantId, params.tenant.slug);
    return { provisioned: true };
  }

  async getAllTenantsStats(): Promise<
    Record<
      string,
      {
        dbConnected: boolean;
        branchCount: number;
        userCount: number;
        customerCount: number;
        orderCount: number;
      }
    >
  > {
    const [branches, staff, customers, orders] = await Promise.all([
      this.dataSource.query(
        `SELECT tenant_id, COUNT(*)::int AS cnt FROM branches WHERE is_active = true GROUP BY tenant_id`,
      ),
      this.dataSource.query(
        `SELECT tenant_id, COUNT(*)::int AS cnt FROM laundry_staff WHERE is_active = true GROUP BY tenant_id`,
      ),
      this.dataSource.query(
        `SELECT tenant_id, COUNT(*)::int AS cnt FROM customers GROUP BY tenant_id`,
      ),
      this.dataSource.query(
        `SELECT tenant_id, COUNT(*)::int AS cnt FROM laundry_orders GROUP BY tenant_id`,
      ),
    ]);

    const result: Record<
      string,
      {
        dbConnected: boolean;
        branchCount: number;
        userCount: number;
        customerCount: number;
        orderCount: number;
      }
    > = {};

    const ensure = (tid: string) => {
      if (!result[tid]) {
        result[tid] = {
          dbConnected: true,
          branchCount: 0,
          userCount: 0,
          customerCount: 0,
          orderCount: 0,
        };
      }
      return result[tid];
    };

    for (const r of branches) ensure(r.tenant_id).branchCount = Number(r.cnt || 0);
    for (const r of staff) ensure(r.tenant_id).userCount = Number(r.cnt || 0);
    for (const r of customers) ensure(r.tenant_id).customerCount = Number(r.cnt || 0);
    for (const r of orders) ensure(r.tenant_id).orderCount = Number(r.cnt || 0);

    return result;
  }
}
