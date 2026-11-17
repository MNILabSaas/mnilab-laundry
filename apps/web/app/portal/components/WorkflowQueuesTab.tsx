'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  formatRupiah,
  laundryFetch,
  STATUS_LABELS,
  type IroningPayoutItem,
  type LaundryUserProfile,
  type OrderItemDetail,
} from '../../lib/laundry-api';

export function WorkflowQueuesTab({
  user,
  selectedBranchId,
}: {
  user: LaundryUserProfile;
  selectedBranchId: string;
}) {
  const [washingQueue, setWashingQueue] = useState<OrderItemDetail[]>([]);
  const [ironingQueue, setIroningQueue] = useState<OrderItemDetail[]>([]);
  const [payouts, setPayouts] = useState<IroningPayoutItem[]>([]);
  const [earnings, setEarnings] = useState<{
    unpaidAmount: number;
    paidAmount: number;
    totalItems: number;
  } | null>(null);
  const [rackInputs, setRackInputs] = useState<Record<string, string>>({});
  const [payoutNotes, setPayoutNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const canSeeWashing = ['SUPER_OWNER', 'BRANCH_OWNER', 'CASHIER', 'WASHING'].includes(
    user.role,
  );
  const canSeeIroning = ['SUPER_OWNER', 'BRANCH_OWNER', 'IRONING'].includes(
    user.role,
  );

  const reload = useCallback(async () => {
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    const [w, i, p, e] = await Promise.all([
      canSeeWashing
        ? laundryFetch<OrderItemDetail[]>(`/workflow/washing-queue${qs}`)
        : Promise.resolve([]),
      canSeeIroning
        ? laundryFetch<OrderItemDetail[]>(`/workflow/ironing-queue${qs}`)
        : Promise.resolve([]),
      canSeeIroning
        ? laundryFetch<IroningPayoutItem[]>(`/workflow/ironing-payouts${qs}`)
        : Promise.resolve([]),
      canSeeIroning
        ? laundryFetch<{ unpaidAmount: number; paidAmount: number; totalItems: number }>(
            `/workflow/ironing-earnings${qs}`,
          )
        : Promise.resolve(null),
    ]);
    setWashingQueue(w);
    setIroningQueue(i);
    setPayouts(p);
    setEarnings(e);
  }, [selectedBranchId, canSeeWashing, canSeeIroning]);

  useEffect(() => {
    let active = true;
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    Promise.all([
      canSeeWashing
        ? laundryFetch<OrderItemDetail[]>(`/workflow/washing-queue${qs}`)
        : Promise.resolve([]),
      canSeeIroning
        ? laundryFetch<OrderItemDetail[]>(`/workflow/ironing-queue${qs}`)
        : Promise.resolve([]),
      canSeeIroning
        ? laundryFetch<IroningPayoutItem[]>(`/workflow/ironing-payouts${qs}`)
        : Promise.resolve([]),
      canSeeIroning
        ? laundryFetch<{ unpaidAmount: number; paidAmount: number; totalItems: number }>(
            `/workflow/ironing-earnings${qs}`,
          )
        : Promise.resolve(null),
    ])
      .then(([w, i, p, e]) => {
        if (!active) return;
        setWashingQueue(w);
        setIroningQueue(i);
        setPayouts(p);
        setEarnings(e);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedBranchId, canSeeWashing, canSeeIroning]);

  async function handleTransition(
    itemId: string,
    targetStatus: string,
    rackNumber?: string,
  ) {
    setErr(null);
    setMsg(null);
    try {
      await laundryFetch(`/workflow/items/${itemId}/status`, {
        method: 'POST',
        body: JSON.stringify({ targetStatus, rackNumber }),
      });
      setMsg('Status cucian diperbarui.');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memperbarui status');
    }
  }

  async function handleRequestPayout(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const now = new Date();
    try {
      await laundryFetch('/workflow/ironing-payouts/request', {
        method: 'POST',
        body: JSON.stringify({
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          employeeNotes: payoutNotes || undefined,
        }),
      });
      setPayoutNotes('');
      setMsg('Pengajuan pencairan upah setrika berhasil dikirim.');
      await reload();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal mengajukan pencairan');
    }
  }

  async function handlePayPayout(id: string) {
    setErr(null);
    setMsg(null);
    try {
      await laundryFetch(`/workflow/ironing-payouts/${id}/pay`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentNotes: 'Dibayarkan oleh Owner' }),
      });
      setMsg('Pencairan upah disetujui dan saldo setrika di-reset.');
      await reload();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal menyetujui pencairan');
    }
  }

  async function exportIroningCsv() {
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    const rows = await laundryFetch<OrderItemDetail[]>(
      `/workflow/ironing-history${qs}`,
    );
    const header = ['OrderNumber', 'Customer', 'Service', 'Qty', 'Wage', 'Paid'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.order?.orderNumber || '',
          `"${(r.order?.customer?.name || '').replaceAll('"', '""')}"`,
          `"${r.serviceName.replaceAll('"', '""')}"`,
          r.quantity,
          r.ironingWage || 0,
          r.ironingPaidAt ? 'PAID' : 'UNPAID',
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekapan-setrika-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {err && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{err}</div>}
      {msg && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{msg}</div>}

      {canSeeWashing && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
          <h3 className="text-sm font-bold text-[var(--brand-dark)]">
            Antrian Cuci & Penugasan Rak ({washingQueue.length})
          </h3>
          <div className="space-y-2 text-xs">
            {washingQueue.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 p-3"
              >
                <div>
                  <span className="font-mono font-bold">
                    {item.order?.orderNumber}
                  </span>{' '}
                  • {item.serviceName} ({item.quantity} {item.priceUnit}) •{' '}
                  {STATUS_LABELS[item.status]}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    placeholder="No. Rak (mis. R-04)"
                    value={rackInputs[item.id] ?? item.rackNumber ?? ''}
                    onChange={(e) =>
                      setRackInputs((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    className="w-32 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    onClick={() =>
                      void handleTransition(
                        item.id,
                        'SELESAI',
                        rackInputs[item.id] || item.rackNumber || '',
                      )
                    }
                    className="rounded-lg bg-[var(--brand-dark)] px-3 py-1.5 font-semibold text-white"
                  >
                    Selesai & Simpan Rak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {canSeeIroning && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[var(--brand-dark)]">
                Antrian & Upah Setrika ({ironingQueue.length})
              </h3>
              {earnings && (
                <p className="text-xs text-zinc-500">
                  Belum cair: <strong>{formatRupiah(earnings.unpaidAmount)}</strong>{' '}
                  • Sudah cair: <strong>{formatRupiah(earnings.paidAmount)}</strong>
                </p>
              )}
            </div>
            <button
              onClick={() => void exportIroningCsv()}
              className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
            >
              Ekspor Rekapan (.CSV)
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {ironingQueue.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 p-3"
              >
                <div>
                  <span className="font-mono font-bold">
                    {item.order?.orderNumber}
                  </span>{' '}
                  • {item.serviceName} ({item.quantity} {item.priceUnit}) •{' '}
                  {STATUS_LABELS[item.status]}
                </div>
                <div className="flex gap-2">
                  {item.status !== 'PROSES_SETRIKA' ? (
                    <button
                      onClick={() => void handleTransition(item.id, 'PROSES_SETRIKA')}
                      className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-white"
                    >
                      Ambil Setrika
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleTransition(item.id, 'SETRIKA_SELESAI')}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"
                    >
                      Setrika Selesai
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {user.role === 'IRONING' && (
            <form
              onSubmit={handleRequestPayout}
              className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4 text-xs"
            >
              <input
                value={payoutNotes}
                onChange={(e) => setPayoutNotes(e.target.value)}
                placeholder="No. Rekening / Catatan Pencairan"
                className="flex-1 rounded-xl border border-zinc-300 px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 font-semibold text-white"
              >
                Ajukan Pencairan Upah
              </button>
            </form>
          )}

          <div className="space-y-2 text-xs">
            <h4 className="font-semibold text-zinc-700">Riwayat Pengajuan Upah</h4>
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2"
              >
                <div>
                  {p.employee?.name} • {p.periodMonth}/{p.periodYear} •{' '}
                  <strong>{formatRupiah(p.amount)}</strong> ({p.totalItems} item)
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-zinc-100 px-2 py-0.5">{p.status}</span>
                  {['SUPER_OWNER', 'BRANCH_OWNER'].includes(user.role) &&
                    p.status === 'PENDING' && (
                      <button
                        onClick={() => void handlePayPayout(p.id)}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white"
                      >
                        Bayar & Setujui
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
