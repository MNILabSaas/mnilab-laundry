'use client';

import { type FormEvent, useEffect, useState } from 'react';
import {
  formatRupiah,
  laundryFetch,
  type LaundryServiceItem,
  type OrderDetail,
  type PaymentMethod,
} from '../../lib/laundry-api';

interface DraftLine {
  serviceId: string;
  weightKg: string;
  quantity: string;
}

export function CashierPosTab({
  selectedBranchId,
}: {
  selectedBranchId: string;
}) {
  const [services, setServices] = useState<LaundryServiceItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { serviceId: '', weightKg: '3', quantity: '1' },
  ]);
  const [discount, setDiscount] = useState(0);
  const [isPayLater, setIsPayLater] = useState(false);
  const [initialPay, setInitialPay] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [receipt, setReceipt] = useState<{
    order: OrderDetail;
    whatsappUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    laundryFetch<LaundryServiceItem[]>(`/services${qs}`)
      .then((list) => {
        setServices(list);
        if (list.length > 0) {
          setLines((prev) =>
            prev.map((l) => (l.serviceId ? l : { ...l, serviceId: list[0].id })),
          );
        }
      })
      .catch(() => undefined);
  }, [selectedBranchId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const items = lines.map((l) => {
        const svc = services.find((s) => s.id === l.serviceId);
        if (svc?.priceUnit === 'KG') {
          return { serviceId: l.serviceId, weightKg: Number(l.weightKg || 1) };
        }
        return { serviceId: l.serviceId, quantity: Number(l.quantity || 1) };
      });

      const created = await laundryFetch<OrderDetail>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          branchId: selectedBranchId || undefined,
          customerName,
          customerPhone,
          items,
          discount: Number(discount || 0),
          isPayLater,
          initialPaymentAmount: Number(initialPay || 0),
          initialPaymentMethod: payMethod,
        }),
      });

      const rec = await laundryFetch<{ order: OrderDetail; whatsappUrl: string }>(
        `/orders/${created.id}/receipt`,
      );
      setReceipt(rec);
      setCustomerName('');
      setCustomerPhone('');
      setDiscount(0);
      setInitialPay(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat pesanan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 rounded-2xl border border-zinc-200 bg-white p-6 space-y-4"
      >
        <h2 className="text-base font-bold text-[var(--brand-dark)]">
          Kasir POS — Buat Transaksi Baru
        </h2>
        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            placeholder="Nama Pelanggan"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
          />
          <input
            required
            placeholder="No. WhatsApp (08... 11-13 digit)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
          />
        </div>

        <div className="space-y-2">
          {lines.map((line, idx) => {
            const svc = services.find((s) => s.id === line.serviceId);
            return (
              <div
                key={idx}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3"
              >
                <select
                  value={line.serviceId}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, i) =>
                        i === idx ? { ...x, serviceId: e.target.value } : x,
                      ),
                    )
                  }
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatRupiah(s.price)}/{s.priceUnit})
                    </option>
                  ))}
                </select>
                {svc?.priceUnit === 'KG' ? (
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={line.weightKg}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, weightKg: e.target.value } : x,
                        ),
                      )
                    }
                    className="w-24 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs"
                    placeholder="Kg"
                  />
                ) : (
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, quantity: e.target.value } : x,
                        ),
                      )
                    }
                    className="w-24 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs"
                    placeholder="Qty"
                  />
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                { serviceId: services[0]?.id || '', weightKg: '3', quantity: '1' },
              ])
            }
            className="text-xs font-semibold text-[var(--brand-dark)] hover:underline"
          >
            + Tambah Item Layanan
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-zinc-600">
            Diskon Tambahan (Rp)
            <input
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            />
          </label>
          <label className="text-xs text-zinc-600">
            Bayar Awal (Rp)
            <input
              type="number"
              min={0}
              value={initialPay}
              onChange={(e) => setInitialPay(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            />
          </label>
          <label className="text-xs text-zinc-600">
            Metode Bayar
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            >
              <option value="CASH">CASH</option>
              <option value="QRIS">QRIS</option>
              <option value="TRANSFER">TRANSFER</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={isPayLater}
            onChange={(e) => setIsPayLater(e.target.checked)}
          />
          Aktifkan Pay Later (terapkan biaya layanan cabang)
        </label>

        <button
          type="submit"
          disabled={busy || services.length === 0}
          className="w-full rounded-xl bg-[var(--brand-dark)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Membuat Nota...' : 'Buat Nota Transaksi'}
        </button>
      </form>

      <div className="lg:col-span-5 rounded-2xl border border-zinc-200 bg-white p-6">
        <h3 className="text-sm font-bold text-[var(--brand-dark)]">
          Struk Thermal & Nota WhatsApp
        </h3>
        {receipt ? (
          <div className="mt-4 space-y-3 text-xs">
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 font-mono space-y-1">
              <div className="font-bold">{receipt.order.orderNumber}</div>
              <div>Pelanggan: {receipt.order.customer?.name}</div>
              <div>Total: {formatRupiah(receipt.order.total)}</div>
              <div>Dibayar: {formatRupiah(receipt.order.paidAmount)}</div>
              <div>Status: {receipt.order.paymentStatus}</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-xl border border-zinc-300 py-2 font-semibold"
              >
                Cetak Struk
              </button>
              <a
                href={receipt.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl bg-emerald-600 py-2 text-center font-semibold text-white"
              >
                Kirim WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-zinc-500">
            Struk dan tautan WhatsApp akan muncul setelah nota berhasil dibuat.
          </p>
        )}
      </div>
    </div>
  );
}
