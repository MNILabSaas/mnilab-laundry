import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  ItemStatus,
  OrderPaymentStatus,
  PriceUnit,
  UserRole,
  WorkflowCode,
} from '../src/common/enums.js';
import {
  calculateItemDiscount,
  calculateItemPrice,
  calculateOrderTotals,
  summarizePayments,
} from '../src/orders/pricing.js';
import { getWorkflow } from '../src/workflow/workflow.config.js';
import {
  assertCanAssignRack,
  assertTransition,
} from '../src/workflow/workflow.policy.js';

describe('Aturan Bisnis Laundry (Harga, Diskon, Pembayaran, & 5 Workflow)', () => {
  describe('Perhitungan Harga & Diskon Backend', () => {
    it('menghitung layanan KG sesuai berat aktual bila >= minimum berat', () => {
      const res = calculateItemPrice({
        serviceName: 'Cuci Kering Setrika',
        priceUnit: PriceUnit.KG,
        unitPrice: 7000,
        minWeightKg: 3,
        weightKg: 4.2,
      });
      expect(res.quantity).toBe(4.2);
      expect(res.itemTotal).toBe(29400);
    });

    it('menerapkan minimum berat layanan KG saat berat aktual di bawah minimum', () => {
      const res = calculateItemPrice({
        serviceName: 'Cuci Kering',
        priceUnit: PriceUnit.KG,
        unitPrice: 5500,
        minWeightKg: 3,
        weightKg: 1.5,
      });
      expect(res.quantity).toBe(3);
      expect(res.itemTotal).toBe(16500);
    });

    it('menolak layanan ITEM jika quantity bukan bilangan bulat >= 1', () => {
      expect(() =>
        calculateItemPrice({
          serviceName: 'Bedcover Besar',
          priceUnit: PriceUnit.ITEM,
          unitPrice: 35000,
          minWeightKg: null,
          quantity: 0,
        }),
      ).toThrow(BadRequestException);
    });

    it('menghitung diskon PERCENTAGE & FIXED tanpa melebihi subtotal item', () => {
      expect(calculateItemDiscount(50000, 'PERCENTAGE', 10)).toBe(5000);
      expect(calculateItemDiscount(10000, 'FIXED', 25000)).toBe(10000);
      expect(calculateItemDiscount(10000, 'NONE', 5000)).toBe(0);
    });

    it('menghitung total order dan ringkasan status pembayaran UNPAID/PARTIAL/PAID', () => {
      const totals = calculateOrderTotals([21000, 35000], 6000);
      expect(totals).toEqual({ subtotal: 56000, discount: 6000, total: 50000 });

      expect(summarizePayments(50000, []).paymentStatus).toBe(
        OrderPaymentStatus.UNPAID,
      );
      expect(summarizePayments(50000, [20000]).paymentStatus).toBe(
        OrderPaymentStatus.PARTIAL,
      );
      expect(summarizePayments(50000, [20000, 30000]).paymentStatus).toBe(
        OrderPaymentStatus.PAID,
      );
    });
  });

  describe('State Machine 5 Workflow & Otorisasi Role', () => {
    it('memvalidasi status awal seluruh 5 workflow', () => {
      expect(getWorkflow(WorkflowCode.WASH_IRON).initialStatus).toBe(
        ItemStatus.PROSES_CUCI,
      );
      expect(getWorkflow(WorkflowCode.WASH_DRY).initialStatus).toBe(
        ItemStatus.PROSES_CUCI,
      );
      expect(getWorkflow(WorkflowCode.WASH_WET).initialStatus).toBe(
        ItemStatus.PROSES_CUCI,
      );
      expect(getWorkflow(WorkflowCode.IRON_ONLY).initialStatus).toBe(
        ItemStatus.MENUNGGU_SETRIKA,
      );
      expect(getWorkflow(WorkflowCode.WASH_IRON_ITEM).initialStatus).toBe(
        ItemStatus.PROSES_CUCI,
      );
    });

    it('menolak START_IRONING oleh WASHING dan menolak ambil ulang item milik petugas lain', () => {
      expect(() =>
        assertTransition({
          workflow: WorkflowCode.WASH_IRON,
          currentStatus: ItemStatus.PROSES_CUCI,
          targetStatus: ItemStatus.PROSES_SETRIKA,
          actorRole: UserRole.WASHING,
          actorId: 'staff-w1',
          ironingStaffId: null,
          rackNumber: null,
        }),
      ).toThrow(ForbiddenException);

      expect(() =>
        assertTransition({
          workflow: WorkflowCode.WASH_IRON,
          currentStatus: ItemStatus.PROSES_CUCI,
          targetStatus: ItemStatus.PROSES_SETRIKA,
          actorRole: UserRole.IRONING,
          actorId: 'staff-i2',
          ironingStaffId: 'staff-i1',
          rackNumber: null,
        }),
      ).toThrow(ConflictException);
    });

    it('mewajibkan nomor rak sebelum status menjadi SELESAI', () => {
      expect(() =>
        assertTransition({
          workflow: WorkflowCode.WASH_DRY,
          currentStatus: ItemStatus.PROSES_CUCI,
          targetStatus: ItemStatus.SELESAI,
          actorRole: UserRole.WASHING,
          actorId: 'staff-w1',
          ironingStaffId: null,
          rackNumber: null,
        }),
      ).toThrow(BadRequestException);

      const ok = assertTransition({
        workflow: WorkflowCode.WASH_DRY,
        currentStatus: ItemStatus.PROSES_CUCI,
        targetStatus: ItemStatus.SELESAI,
        actorRole: UserRole.WASHING,
        actorId: 'staff-w1',
        ironingStaffId: null,
        rackNumber: 'R-12',
      });
      expect(ok.to).toBe(ItemStatus.SELESAI);
    });

    it('memvalidasi hak assignRack hanya pada tahap siap rak & role yang berhak', () => {
      expect(() =>
        assertCanAssignRack(
          WorkflowCode.WASH_IRON,
          ItemStatus.PROSES_CUCI,
          UserRole.CASHIER,
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        assertCanAssignRack(
          WorkflowCode.WASH_IRON,
          ItemStatus.SETRIKA_SELESAI,
          UserRole.IRONING,
        ),
      ).toThrow(ForbiddenException);

      expect(() =>
        assertCanAssignRack(
          WorkflowCode.WASH_IRON,
          ItemStatus.SETRIKA_SELESAI,
          UserRole.CASHIER,
        ),
      ).not.toThrow();
    });
  });
});
