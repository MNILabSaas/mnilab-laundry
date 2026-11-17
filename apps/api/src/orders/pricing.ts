import { BadRequestException } from '@nestjs/common';
import { OrderPaymentStatus, PriceUnit } from '../common/enums.js';
import {
  compareMoney,
  multiplyMoney,
  subtractMoney,
  sumMoney,
} from '../common/utils/money.js';

export interface ItemPricingInput {
  serviceName: string;
  priceUnit: PriceUnit;
  unitPrice: number;
  minWeightKg: number | null;
  weightKg?: number | null;
  garmentCount?: number | null;
  quantity?: number | null;
}

export interface ItemPricingResult {
  weightKg: number | null;
  garmentCount: number | null;
  quantity: number;
  itemTotal: number;
}

export function calculateItemPrice(input: ItemPricingInput): ItemPricingResult {
  const garmentCount = input.garmentCount ?? null;
  switch (input.priceUnit) {
    case PriceUnit.KG: {
      const weight = input.weightKg;
      if (weight === null || weight === undefined || !(weight > 0)) {
        throw new BadRequestException(
          `Layanan "${input.serviceName}" (per KG) membutuhkan berat yang valid`,
        );
      }
      const min =
        input.minWeightKg && Number(input.minWeightKg) > 0
          ? Number(input.minWeightKg)
          : 0;
      const quantity = min > 0 && compareMoney(weight, min) < 0 ? min : weight;
      return {
        weightKg: weight,
        garmentCount,
        quantity,
        itemTotal: multiplyMoney(quantity, input.unitPrice),
      };
    }
    case PriceUnit.ITEM: {
      const quantity = input.quantity ?? input.garmentCount;
      if (!quantity || !Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException(
          `Layanan "${input.serviceName}" (per ITEM) membutuhkan jumlah item (bilangan bulat ≥ 1)`,
        );
      }
      return {
        weightKg: input.weightKg ?? null,
        garmentCount: garmentCount ?? quantity,
        quantity,
        itemTotal: multiplyMoney(quantity, input.unitPrice),
      };
    }
    case PriceUnit.FLAT: {
      const quantity = input.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException(
          `Layanan "${input.serviceName}" (FLAT) membutuhkan quantity bilangan bulat ≥ 1`,
        );
      }
      return {
        weightKg: input.weightKg ?? null,
        garmentCount,
        quantity,
        itemTotal: multiplyMoney(quantity, input.unitPrice),
      };
    }
    default:
      throw new BadRequestException('Satuan harga tidak dikenal');
  }
}

export function calculateItemDiscount(
  itemTotal: number,
  discountType?: 'NONE' | 'PERCENTAGE' | 'FIXED' | null,
  discountValue?: number | null,
): number {
  if (!discountType || discountType === 'NONE' || !discountValue || discountValue <= 0) {
    return 0;
  }
  if (discountType === 'PERCENTAGE') {
    const disc = Math.round((itemTotal * discountValue) / 100);
    return Math.min(itemTotal, Math.max(0, disc));
  }
  if (discountType === 'FIXED') {
    return Math.min(itemTotal, Math.max(0, discountValue));
  }
  return 0;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  total: number;
}

export function calculateOrderTotals(itemTotals: number[], discount = 0): OrderTotals {
  const subtotal = sumMoney(itemTotals);
  if (discount < 0) throw new BadRequestException('Diskon tidak boleh negatif');
  if (compareMoney(discount, subtotal) > 0) {
    throw new BadRequestException('Diskon tidak boleh melebihi subtotal');
  }
  return { subtotal, discount, total: subtractMoney(subtotal, discount) };
}

export interface PaymentSummary {
  total: number;
  paidAmount: number;
  remaining: number;
  paymentStatus: OrderPaymentStatus;
}

export function summarizePayments(
  total: number,
  successAmounts: number[],
): PaymentSummary {
  const paidAmount = sumMoney(successAmounts);
  const remaining = Math.max(0, subtractMoney(total, paidAmount));
  let paymentStatus = OrderPaymentStatus.UNPAID;
  if (compareMoney(paidAmount, 0) > 0) {
    paymentStatus =
      compareMoney(paidAmount, total) >= 0
        ? OrderPaymentStatus.PAID
        : OrderPaymentStatus.PARTIAL;
  } else if (compareMoney(total, 0) === 0) {
    paymentStatus = OrderPaymentStatus.PAID;
  }
  return { total, paidAmount, remaining, paymentStatus };
}
