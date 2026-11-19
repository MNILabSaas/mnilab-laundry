import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import {
  ExpenseApprovalStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '../common/enums.js';
import { compareMoney, sumMoney } from '../common/utils/money.js';
import {
  assertPaymentMethodAvailable,
  isQrisPaymentEnabled,
  QRIS_MAINTENANCE_MESSAGE,
} from '../common/utils/qris-feature.js';
import { resolveActorBranchScope } from '../common/utils/scope.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { summarizePayments } from '../orders/pricing.js';
import { PlatformClientService } from '../platform/platform-client.service.js';
import {
  TenantProfile,
  type TenantBankAccountItem,
} from '../tenant-context/tenant-profile.entity.js';
import type {
  CreatePaymentDto,
  ListPaymentsQueryDto,
  UpdatePaymentStatusDto,
} from './dto/payment.dto.js';
import { Payment } from './payment.entity.js';
import { QrisWithdrawal } from './qris-withdrawal.entity.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(QrisWithdrawal)
    private readonly qrisWithdrawalsRepo: Repository<QrisWithdrawal>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(TenantProfile)
    private readonly profilesRepo: Repository<TenantProfile>,
    @Optional()
    private readonly platformClient?: PlatformClientService,
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
    assertPaymentMethodAvailable(dto.method);
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

  /**
   * Rekonsiliasi & rincian saldo QRIS per cabang tiap bulannya untuk Super Owner / Branch Owner.
   * Memisahkan:
   * - Total QRIS Masuk
   * - Sudah Ditarik & Di-ACC Super Admin (APPROVED)
   * - Sedang Diajukan / Menunggu Transfer Super Admin (PENDING)
   * - Belum Ditarik / Siap Dicairkan (qrisWithdrawalId IS NULL)
   */
  async getQrisReconciliationForTenant(
    actor: LaundryAuthUser,
    query: { month?: number; year?: number; branchId?: string },
  ) {
    const now = new Date();
    const month =
      query.month !== undefined && Number(query.month) >= 0
        ? Number(query.month)
        : now.getMonth() + 1;
    const year =
      query.year !== undefined && Number(query.year) > 2000
        ? Number(query.year)
        : now.getFullYear();

    const scopedBranchId = resolveActorBranchScope(actor, query.branchId);

    const [branches, profile, allWithdrawals] = await Promise.all([
      this.branchesRepo.find({
        where: scopedBranchId
          ? { tenantId: actor.tenantId, id: scopedBranchId, isActive: true }
          : { tenantId: actor.tenantId, isActive: true },
        order: { isMain: 'DESC', name: 'ASC' },
      }),
      this.profilesRepo.findOne({ where: { tenantId: actor.tenantId } }),
      this.qrisWithdrawalsRepo.find({
        where: scopedBranchId
          ? { tenantId: actor.tenantId, branchId: scopedBranchId }
          : { tenantId: actor.tenantId },
        relations: { branch: true },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const qb = this.paymentsRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.order', 'o')
      .leftJoinAndSelect('o.customer', 'c')
      .leftJoinAndSelect('p.branch', 'b')
      .where('p.tenantId = :tenantId', { tenantId: actor.tenantId })
      .andWhere('p.method = :method', { method: PaymentMethod.QRIS })
      .andWhere('p.status = :status', { status: PaymentStatus.SUCCESS });

    if (scopedBranchId) {
      qb.andWhere('p.branchId = :branchId', { branchId: scopedBranchId });
    }

    if (month > 0) {
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      qb.andWhere('p.paidAt >= :startDate AND p.paidAt < :endDate', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    }

    const qrisPayments = await qb.orderBy('p.paidAt', 'DESC').getMany();
    const withdrawalById = new Map<string, QrisWithdrawal>();
    for (const w of allWithdrawals) {
      withdrawalById.set(w.id, w);
    }

    const branchSummaries = branches.map((br) => {
      const branchPayments = qrisPayments.filter((p) => p.branchId === br.id);
      let totalQrisCollected = 0;
      let withdrawnApprovedAmount = 0;
      let pendingWithdrawalAmount = 0;
      let availableToWithdrawAmount = 0;
      let unwithdrawnTransactionsCount = 0;

      const transactions = branchPayments.map((p) => {
        const amt = Number(p.amount || 0);
        totalQrisCollected = sumMoney([totalQrisCollected, amt]);

        const linkedW = p.qrisWithdrawalId
          ? withdrawalById.get(p.qrisWithdrawalId)
          : null;
        let withdrawalStatus: 'UNWITHDRAWN' | 'PENDING' | 'APPROVED' =
          'UNWITHDRAWN';
        if (linkedW && linkedW.status === ExpenseApprovalStatus.APPROVED) {
          withdrawalStatus = 'APPROVED';
          withdrawnApprovedAmount = sumMoney([withdrawnApprovedAmount, amt]);
        } else if (linkedW && linkedW.status === ExpenseApprovalStatus.PENDING) {
          withdrawalStatus = 'PENDING';
          pendingWithdrawalAmount = sumMoney([pendingWithdrawalAmount, amt]);
        } else {
          availableToWithdrawAmount = sumMoney([availableToWithdrawAmount, amt]);
          unwithdrawnTransactionsCount += 1;
        }

        return {
          id: p.id,
          orderId: p.orderId,
          orderNumber: p.order?.orderNumber || '-',
          customerName: p.order?.customer?.name || '-',
          amount: amt,
          paidAt: p.paidAt,
          reference: p.reference,
          qrisWithdrawalId: p.qrisWithdrawalId,
          qrisSettledAt: p.qrisSettledAt,
          withdrawalStatus,
        };
      });

      return {
        branchId: br.id,
        branchName: br.name,
        branchCode: br.code,
        isMain: br.isMain,
        periodMonth: month,
        periodYear: year,
        totalQrisCollected,
        withdrawnApprovedAmount,
        pendingWithdrawalAmount,
        availableToWithdrawAmount,
        totalTransactions: branchPayments.length,
        unwithdrawnTransactionsCount,
        canRequestWithdrawal: availableToWithdrawAmount > 0 && unwithdrawnTransactionsCount > 0,
        transactions,
      };
    });

    const totalQrisCollected = sumMoney(
      branchSummaries.map((b) => b.totalQrisCollected),
    );
    const withdrawnApprovedAmount = sumMoney(
      branchSummaries.map((b) => b.withdrawnApprovedAmount),
    );
    const pendingWithdrawalAmount = sumMoney(
      branchSummaries.map((b) => b.pendingWithdrawalAmount),
    );
    const availableToWithdrawAmount = sumMoney(
      branchSummaries.map((b) => b.availableToWithdrawAmount),
    );

    return {
      month,
      year,
      qrisPaymentEnabled: isQrisPaymentEnabled(),
      qrisProvider: 'BANK_NOBU',
      qrisMaintenanceMessage: QRIS_MAINTENANCE_MESSAGE,
      bankAccounts: profile?.bankAccountsJson ?? [],
      summary: {
        totalQrisCollected,
        withdrawnApprovedAmount,
        pendingWithdrawalAmount,
        availableToWithdrawAmount,
        totalTransactions: qrisPayments.length,
      },
      branchSummaries,
      withdrawals: allWithdrawals.map((w) => ({
        id: w.id,
        tenantId: w.tenantId,
        branchId: w.branchId,
        branchName: w.branch?.name || '-',
        branchCode: w.branch?.code || '-',
        periodMonth: w.periodMonth,
        periodYear: w.periodYear,
        amount: Number(w.amount || 0),
        totalTransactions: w.totalTransactions,
        status: w.status,
        requestedByName: w.requestedByName,
        ownerNotes: w.ownerNotes,
        targetBankAccount: w.targetBankAccountJson,
        transferProof: w.transferProof,
        adminNotes: w.adminNotes,
        reviewedByEmail: w.reviewedByEmail,
        reviewedAt: w.reviewedAt,
        rejectionReason: w.rejectionReason,
        createdAt: w.createdAt,
      })),
    };
  }

  /**
   * Super Owner / Branch Owner mengajukan penarikan hasil QRIS per cabang untuk bulan tertentu ke Super Admin.
   */
  async requestQrisWithdrawal(
    dto: {
      branchId: string;
      month: number;
      year: number;
      ownerNotes?: string;
      targetBankAccount?: TenantBankAccountItem;
    },
    actor: LaundryAuthUser,
  ) {
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      actor.role !== UserRole.BRANCH_OWNER
    ) {
      throw new ForbiddenException(
        'Hanya Super Owner atau Branch Owner yang dapat mengajukan penarikan hasil QRIS cabang',
      );
    }

    const scopedBranchId = resolveActorBranchScope(actor, dto.branchId);
    if (!scopedBranchId) {
      throw new BadRequestException('Pilih cabang yang akan ditarik dana QRIS-nya');
    }

    const month = Number(dto.month);
    const year = Number(dto.year);
    if (!month || month < 1 || month > 12 || !year || year < 2020) {
      throw new BadRequestException('Periode bulan dan tahun penarikan QRIS tidak valid');
    }

    return this.dataSource.transaction(async (manager) => {
      const branch = await manager.findOne(Branch, {
        where: { id: scopedBranchId, tenantId: actor.tenantId },
      });
      if (!branch) throw new NotFoundException('Cabang tidak ditemukan');

      const profile = await manager.findOne(TenantProfile, {
        where: { tenantId: actor.tenantId },
      });

      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));

      const allBranchQrisPayments = await manager
        .createQueryBuilder(Payment, 'p')
        .where('p.tenantId = :tenantId', { tenantId: actor.tenantId })
        .andWhere('p.branchId = :branchId', { branchId: branch.id })
        .andWhere('p.method = :method', { method: PaymentMethod.QRIS })
        .andWhere('p.status = :status', { status: PaymentStatus.SUCCESS })
        .andWhere('p.paidAt >= :startDate AND p.paidAt < :endDate', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        })
        .getMany();

      // Ambil semua pengajuan yang masih aktif (PENDING atau APPROVED) untuk mengecek mana yang benar-benar belum ditarik
      const activeWithdrawals = await manager.find(QrisWithdrawal, {
        where: { tenantId: actor.tenantId, branchId: branch.id },
      });
      const activeWithdrawalIds = new Set(
        activeWithdrawals
          .filter(
            (w) =>
              w.status === ExpenseApprovalStatus.PENDING ||
              w.status === ExpenseApprovalStatus.APPROVED,
          )
          .map((w) => w.id),
      );

      const unwithdrawnPayments = allBranchQrisPayments.filter(
        (p) => !p.qrisWithdrawalId || !activeWithdrawalIds.has(p.qrisWithdrawalId),
      );

      if (unwithdrawnPayments.length === 0) {
        throw new BadRequestException(
          `Tidak ada saldo QRIS yang belum ditarik pada cabang "${branch.name}" untuk periode ${month}/${year}.`,
        );
      }

      const totalAmount = sumMoney(
        unwithdrawnPayments.map((p) => Number(p.amount || 0)),
      );
      if (totalAmount <= 0) {
        throw new BadRequestException('Nominal saldo QRIS yang dapat ditarik adalah Rp0');
      }

      const registeredAccounts = Array.isArray(profile?.bankAccountsJson)
        ? profile.bankAccountsJson
        : [];
      const chosenBank: TenantBankAccountItem | null =
        dto.targetBankAccount &&
        dto.targetBankAccount.bankName &&
        dto.targetBankAccount.accountNumber
          ? {
              bankName: dto.targetBankAccount.bankName.trim().toUpperCase(),
              accountNumber: dto.targetBankAccount.accountNumber.trim(),
              accountHolder: dto.targetBankAccount.accountHolder?.trim() || '-',
            }
          : registeredAccounts[0] ?? null;

      if (!chosenBank || !chosenBank.bankName || !chosenBank.accountNumber) {
        throw new BadRequestException(
          'Super Owner wajib mencantumkan nomor rekening bank tujuan transfer terlebih dahulu agar Super Admin dapat mentransfer hasil QRIS dari Bank Nobu ke rekening Anda.',
        );
      }

      // Jika rekening baru diinput saat request penarikan, otomatis tambahkan ke daftar rekening terdaftar Super Owner
      const alreadyRegistered = registeredAccounts.some(
        (b) =>
          b.bankName.toUpperCase() === chosenBank.bankName.toUpperCase() &&
          b.accountNumber.trim() === chosenBank.accountNumber.trim(),
      );
      if (profile && !alreadyRegistered) {
        const updatedBanks = [...registeredAccounts, chosenBank];
        profile.bankAccountsJson = updatedBanks;
        await manager.save(TenantProfile, profile);
        void this.platformClient
          ?.updateTenantBranding(actor.tenantId, {
            bankAccountsJson: updatedBanks,
          })
          .catch(() => undefined);
      }

      const withdrawal = await manager.save(
        manager.create(QrisWithdrawal, {
          tenantId: actor.tenantId,
          branchId: branch.id,
          periodMonth: month,
          periodYear: year,
          amount: totalAmount,
          totalTransactions: unwithdrawnPayments.length,
          status: ExpenseApprovalStatus.PENDING,
          requestedByStaffId: actor.id,
          requestedByName: actor.name,
          ownerNotes: dto.ownerNotes?.trim() || null,
          targetBankAccountJson: chosenBank,
        }),
      );

      for (const p of unwithdrawnPayments) {
        p.qrisWithdrawalId = withdrawal.id;
      }
      await manager.save(Payment, unwithdrawnPayments);

      return withdrawal;
    });
  }

  /**
   * Super Owner menyimpan/memperbarui daftar nomor rekening bank miliknya (bisa lebih dari 1)
   * untuk tujuan transfer pencairan hasil QRIS dari Bank Nobu oleh Super Admin.
   */
  async updateTenantBankAccounts(
    bankAccounts: TenantBankAccountItem[],
    actor: LaundryAuthUser,
  ) {
    if (
      actor.role !== UserRole.SUPER_OWNER &&
      actor.role !== UserRole.BRANCH_OWNER
    ) {
      throw new ForbiddenException(
        'Hanya Super Owner atau Branch Owner yang dapat mengatur nomor rekening bank pencairan QRIS',
      );
    }

    const normalized: TenantBankAccountItem[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(bankAccounts) ? bankAccounts : []) {
      const bankName = (item?.bankName || '').trim().toUpperCase();
      const accountNumber = (item?.accountNumber || '').trim();
      const accountHolder = (item?.accountHolder || '').trim() || actor.name;
      if (!bankName || !accountNumber) continue;
      const key = `${bankName}:${accountNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({
        bankName,
        accountNumber,
        accountHolder,
        isPrimary: normalized.length === 0,
      });
    }

    const profile = await this.profilesRepo.findOne({
      where: { tenantId: actor.tenantId },
    });
    if (profile) {
      profile.bankAccountsJson = normalized;
      await this.profilesRepo.save(profile);
    }

    if (this.platformClient) {
      await this.platformClient
        .updateTenantBranding(actor.tenantId, {
          bankAccountsJson: normalized,
        })
        .catch(() => undefined);
    }

    return {
      bankAccounts: normalized,
      message:
        'Daftar nomor rekening bank penerima pencairan QRIS berhasil disimpan dan disinkronkan ke Super Admin.',
    };
  }

  /**
   * Internal overview seluruh tenant & cabang untuk Super Admin (Rekonsiliasi QRIS Sudah Ditarik vs Belum Ditarik).
   */
  async getAllTenantsQrisOverviewForInternal(query: {
    month?: number;
    year?: number;
    tenantId?: string;
  }) {
    const month =
      query.month !== undefined && Number(query.month) >= 0
        ? Number(query.month)
        : 0;
    const year =
      query.year !== undefined && Number(query.year) > 2000
        ? Number(query.year)
        : new Date().getFullYear();

    const [profiles, branches, withdrawals] = await Promise.all([
      this.profilesRepo.find(),
      this.branchesRepo.find({ where: { isActive: true }, order: { isMain: 'DESC', name: 'ASC' } }),
      this.qrisWithdrawalsRepo.find({
        relations: { branch: true },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const qb = this.paymentsRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.order', 'o')
      .leftJoinAndSelect('o.customer', 'c')
      .leftJoinAndSelect('p.branch', 'b')
      .where('p.method = :method', { method: PaymentMethod.QRIS })
      .andWhere('p.status = :status', { status: PaymentStatus.SUCCESS });

    if (query.tenantId) {
      qb.andWhere('p.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    if (month > 0) {
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      qb.andWhere('p.paidAt >= :startDate AND p.paidAt < :endDate', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    }

    const allQrisPayments = await qb.orderBy('p.paidAt', 'DESC').getMany();

    const profileByTenantId = new Map<string, TenantProfile>();
    for (const p of profiles) {
      profileByTenantId.set(p.tenantId, p);
    }

    const withdrawalById = new Map<string, QrisWithdrawal>();
    for (const w of withdrawals) {
      withdrawalById.set(w.id, w);
    }

    const tenantIds = new Set<string>();
    for (const p of profiles) tenantIds.add(p.tenantId);
    for (const b of branches) tenantIds.add(b.tenantId);
    for (const pay of allQrisPayments) tenantIds.add(pay.tenantId);

    const tenantSummaries = Array.from(tenantIds)
      .filter((tid) => (!query.tenantId ? true : tid === query.tenantId))
      .map((tid) => {
        const prof = profileByTenantId.get(tid);
        const tenantBranches = branches.filter((b) => b.tenantId === tid);
        const tenantPayments = allQrisPayments.filter((p) => p.tenantId === tid);

        const branchBreakdowns = tenantBranches.map((br) => {
          const brPayments = tenantPayments.filter((p) => p.branchId === br.id);
          let totalQrisCollected = 0;
          let withdrawnApprovedAmount = 0;
          let pendingWithdrawalAmount = 0;
          let unwithdrawnBalanceAmount = 0;

          for (const p of brPayments) {
            const amt = Number(p.amount || 0);
            totalQrisCollected = sumMoney([totalQrisCollected, amt]);
            const w = p.qrisWithdrawalId
              ? withdrawalById.get(p.qrisWithdrawalId)
              : null;
            if (w && w.status === ExpenseApprovalStatus.APPROVED) {
              withdrawnApprovedAmount = sumMoney([withdrawnApprovedAmount, amt]);
            } else if (w && w.status === ExpenseApprovalStatus.PENDING) {
              pendingWithdrawalAmount = sumMoney([pendingWithdrawalAmount, amt]);
            } else {
              unwithdrawnBalanceAmount = sumMoney([unwithdrawnBalanceAmount, amt]);
            }
          }

          return {
            branchId: br.id,
            branchName: br.name,
            branchCode: br.code,
            isMain: br.isMain,
            totalQrisCollected,
            withdrawnApprovedAmount,
            pendingWithdrawalAmount,
            unwithdrawnBalanceAmount,
            totalTransactions: brPayments.length,
          };
        });

        let tTotal = 0;
        let tApproved = 0;
        let tPending = 0;
        let tUnwithdrawn = 0;
        for (const p of tenantPayments) {
          const amt = Number(p.amount || 0);
          tTotal = sumMoney([tTotal, amt]);
          const w = p.qrisWithdrawalId
            ? withdrawalById.get(p.qrisWithdrawalId)
            : null;
          if (w && w.status === ExpenseApprovalStatus.APPROVED) {
            tApproved = sumMoney([tApproved, amt]);
          } else if (w && w.status === ExpenseApprovalStatus.PENDING) {
            tPending = sumMoney([tPending, amt]);
          } else {
            tUnwithdrawn = sumMoney([tUnwithdrawn, amt]);
          }
        }

        return {
          tenantId: tid,
          slug: prof?.slug || tid.slice(0, 8),
          brandName: prof?.brandName || 'Mitra Laundry',
          isDemo: Boolean(prof?.isDemo),
          bankAccounts: prof?.bankAccountsJson ?? [],
          totalQrisCollected: tTotal,
          withdrawnApprovedAmount: tApproved,
          pendingWithdrawalAmount: tPending,
          unwithdrawnBalanceAmount: tUnwithdrawn,
          totalTransactions: tenantPayments.length,
          branches: branchBreakdowns,
        };
      });

    const filteredWithdrawals = withdrawals
      .filter((w) => {
        if (query.tenantId && w.tenantId !== query.tenantId) return false;
        if (month > 0 && (w.periodMonth !== month || w.periodYear !== year)) {
          return false;
        }
        return true;
      })
      .map((w) => {
        const prof = profileByTenantId.get(w.tenantId);
        const linkedPayments = allQrisPayments
          .filter((p) => p.qrisWithdrawalId === w.id)
          .map((p) => ({
            id: p.id,
            orderNumber: p.order?.orderNumber || '-',
            customerName: p.order?.customer?.name || '-',
            amount: Number(p.amount || 0),
            paidAt: p.paidAt,
          }));

        return {
          id: w.id,
          tenantId: w.tenantId,
          tenantSlug: prof?.slug || '-',
          tenantBrandName: prof?.brandName || 'Mitra Laundry',
          tenantBankAccounts: prof?.bankAccountsJson ?? [],
          branchId: w.branchId,
          branchName: w.branch?.name || '-',
          branchCode: w.branch?.code || '-',
          periodMonth: w.periodMonth,
          periodYear: w.periodYear,
          amount: Number(w.amount || 0),
          totalTransactions: w.totalTransactions,
          status: w.status,
          requestedByName: w.requestedByName,
          ownerNotes: w.ownerNotes,
          targetBankAccount: w.targetBankAccountJson,
          transferProof: w.transferProof,
          adminNotes: w.adminNotes,
          reviewedByEmail: w.reviewedByEmail,
          reviewedAt: w.reviewedAt,
          rejectionReason: w.rejectionReason,
          createdAt: w.createdAt,
          items: linkedPayments,
        };
      });

    return {
      month,
      year,
      globalSummary: {
        totalQrisCollected: sumMoney(
          tenantSummaries.map((t) => t.totalQrisCollected),
        ),
        totalWithdrawnApproved: sumMoney(
          tenantSummaries.map((t) => t.withdrawnApprovedAmount),
        ),
        totalPendingWithdrawal: sumMoney(
          tenantSummaries.map((t) => t.pendingWithdrawalAmount),
        ),
        totalUnwithdrawnBalance: sumMoney(
          tenantSummaries.map((t) => t.unwithdrawnBalanceAmount),
        ),
        pendingRequestsCount: withdrawals.filter(
          (w) => w.status === ExpenseApprovalStatus.PENDING,
        ).length,
      },
      tenantSummaries,
      withdrawals: filteredWithdrawals,
    };
  }

  /**
   * Super Admin menyetujui (ACC + pilih rekening tujuan + upload foto bukti transfer)
   * atau menolak pengajuan penarikan QRIS cabang.
   */
  async reviewQrisWithdrawalInternal(
    withdrawalId: string,
    dto: {
      status: 'APPROVED' | 'REJECTED';
      transferProof?: string | null;
      targetBankAccount?: TenantBankAccountItem | null;
      adminNotes?: string | null;
      rejectionReason?: string | null;
      reviewedByEmail: string;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const withdrawal = await manager.findOne(QrisWithdrawal, {
        where: { id: withdrawalId },
        relations: { branch: true },
      });
      if (!withdrawal) {
        throw new NotFoundException('Data pengajuan penarikan QRIS tidak ditemukan');
      }

      const now = new Date();
      if (dto.status === 'APPROVED') {
        if (!dto.transferProof || !dto.transferProof.trim()) {
          throw new BadRequestException(
            'Foto bukti transfer wajib diunggah saat menyetujui (ACC) penarikan QRIS',
          );
        }
        withdrawal.status = ExpenseApprovalStatus.APPROVED;
        withdrawal.transferProof = dto.transferProof.trim();
        if (dto.targetBankAccount && dto.targetBankAccount.bankName) {
          withdrawal.targetBankAccountJson = {
            bankName: dto.targetBankAccount.bankName.trim().toUpperCase(),
            accountNumber: dto.targetBankAccount.accountNumber.trim(),
            accountHolder: dto.targetBankAccount.accountHolder?.trim() || '-',
          };
        }
        withdrawal.adminNotes = dto.adminNotes?.trim() || null;
        withdrawal.reviewedByEmail = dto.reviewedByEmail;
        withdrawal.reviewedAt = now;
        withdrawal.rejectionReason = null;
        await manager.save(QrisWithdrawal, withdrawal);

        await manager.update(
          Payment,
          { qrisWithdrawalId: withdrawal.id },
          { qrisSettledAt: now },
        );
      } else {
        withdrawal.status = ExpenseApprovalStatus.REJECTED;
        withdrawal.rejectionReason =
          dto.rejectionReason?.trim() || 'Ditolak oleh Super Admin';
        withdrawal.adminNotes = dto.adminNotes?.trim() || null;
        withdrawal.reviewedByEmail = dto.reviewedByEmail;
        withdrawal.reviewedAt = now;
        await manager.save(QrisWithdrawal, withdrawal);

        // Kembalikan transaksi QRIS terkait ke status Belum Ditarik (qrisWithdrawalId = null)
        await manager.update(
          Payment,
          { qrisWithdrawalId: withdrawal.id },
          { qrisWithdrawalId: null, qrisSettledAt: null },
        );
      }

      return withdrawal;
    });
  }
}
