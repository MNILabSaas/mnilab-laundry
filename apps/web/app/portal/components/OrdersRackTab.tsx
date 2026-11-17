'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  formatRupiah,
  laundryFetch,
  STATUS_LABELS,
  type OrderDetail,
} from '../../lib/laundry-api';

export function OrdersRackTab({
  selectedBranchId,
}: {
  selectedBranchId: string;
}) {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ limit: '30' });
    if (selectedBranchId) qs.set('branchId', selectedBranchId);
    if (search.trim()) qs.set('search', search.trim());
    const res = await laundryFetch<{ items: OrderDetail[] }>(
      `/orders?${qs.toString()}`,
    );
    setOrders(res.items);
  }, [selectedBranchId, search]);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({ limit: '30' });
    if (selectedBranchId) qs.set('branchId', selectedBranchId);
    if (search.trim()) qs.set('search', search.trim());
    laundryFetch<{ items: OrderDetail[] }>(`/orders?${qs.toString()}`)
      .then((res) => {
        if (active) setOrders(res.items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedBranchId, search]);

  async function settleRemaining(order: OrderDetail) {
    setErr(null);
    setMsg(null);
    const remaining = Math.max(0, Number(order.total) - Number(order.paidAmount));
    if (remaining <= 0) return;
    try {
      await laundryFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          amount: remaining,
          method: 'CASH',
          notes: 'Pelunasan di portal',
        }),
      });
      setMsg(`Nota ${order.orderNumber} berhasil dilunasi.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal melunasi');
    }
  }

  async function markPickedUp(order: OrderDetail) {
    setErr(null);
    setMsg(null);
    try {
      await laundryFetch(`/orders/${order.id}/pickup`, { method: 'POST' });
      setMsg(`Nota ${order.orderNumber} ditandai sudah diambil.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menandai pengambilan');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor nota atau nama/HP pelanggan..."
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs"
        />
        <button
          onClick={() => void load()}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold"
        >
          Refresh
        </button>
      </div>

      {err && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{err}</div>}
      {msg && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{msg}</div>}

      <div className="space-y-3">
        {orders.map((ord) => (
          <div
            key={ord.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-bold text-[var(--brand-dark)]">
                  {ord.orderNumber}
                </span>
                <span className="ml-2 text-xs text-zinc-500">
                  {ord.customer?.name} ({ord.customer?.phone})
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold">{formatRupiah(ord.total)}</span>
                <span className="rounded bg-zinc-100 px-2 py-0.5">
                  {ord.paymentStatus}
                </span>
                {ord.paymentStatus !== 'PAID' && (
                  <button
                    onClick={() => void settleRemaining(ord)}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white"
                  >
                    Lunasi
                  </button>
                )}
                {!ord.pickedUpAt && ord.paymentStatus === 'PAID' && (
                  <button
                    onClick={() => void markPickedUp(ord)}
                    className="rounded-lg bg-[var(--brand-dark)] px-2.5 py-1 font-semibold text-white"
                  >
                    Tandai Diambil
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-zinc-600">
              {ord.items.map((it) => (
                <span
                  key={it.id}
                  className="rounded-lg bg-zinc-50 border border-zinc-200 px-2 py-1"
                >
                  {it.serviceName} • {STATUS_LABELS[it.status]}
                  {it.rackNumber ? ` (Rak ${it.rackNumber})` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
