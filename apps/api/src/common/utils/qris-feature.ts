import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '../enums.js';

/**
 * Status fitur pembayaran QRIS (Dynamic QRIS Bank Nobu).
 *
 * Default: NONAKTIF (Under Maintenance) sampai integrasi API Dynamic QRIS selesai.
 * Aktifkan dengan `QRIS_PAYMENT_ENABLED=true` di `apps/api/.env`, lalu `pm2 reload`.
 */
export const QRIS_MAINTENANCE_MESSAGE =
  'Pembayaran QRIS sedang dalam pemeliharaan (integrasi Dynamic QRIS Bank Nobu). Gunakan pembayaran Tunai untuk sementara.';

export function isQrisPaymentEnabled(): boolean {
  return (process.env.QRIS_PAYMENT_ENABLED || '').trim().toLowerCase() === 'true';
}

export function assertPaymentMethodAvailable(
  method: PaymentMethod | string | null | undefined,
): void {
  if (method === PaymentMethod.QRIS && !isQrisPaymentEnabled()) {
    throw new BadRequestException(QRIS_MAINTENANCE_MESSAGE);
  }
}
