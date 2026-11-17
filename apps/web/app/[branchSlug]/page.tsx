'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import {
  applyTenantThemeToDom,
  getActiveTenantSlug,
  getBranchSlug,
  laundryFetch,
  type BranchItem,
  type PublicTrackedOrder,
  type TenantBrandingInfo,
} from '../lib/laundry-api';

export default function BranchTrackingPage() {
  const params = useParams<{ branchSlug?: string }>();
  const rawSlug = decodeURIComponent(String(params?.branchSlug || '')).toLowerCase();
  const [branch, setBranch] = useState<BranchItem | null>(null);
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<PublicTrackedOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tenantSlug = getActiveTenantSlug();
    laundryFetch<TenantBrandingInfo>('/public/branding', {
      headers: { 'X-Tenant-Slug': tenantSlug },
    })
      .then((b) => applyTenantThemeToDom(b.theme))
      .catch(() => undefined);

    laundryFetch<BranchItem[]>('/branches/public', {
      headers: { 'X-Tenant-Slug': tenantSlug },
    })
      .then((list) => {
        const match =
          list.find((b) => getBranchSlug(b) === rawSlug) ?? list[0] ?? null;
        setBranch(match);
      })
      .catch(() => undefined);
  }, [rawSlug]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ q: query });
      if (branch?.id) qs.set('branchId', branch.id);
      const res = await laundryFetch<PublicTrackedOrder[]>(
        `/public/tracking/search?${qs.toString()}`,
      );
      setOrders(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pencarian gagal');
      setOrders(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f9f4] px-6 py-12 text-[#454745]">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--brand-dark)]">
              Cek Nota {branch ? `— ${branch.name}` : ''}
            </h1>
            <p className="text-xs text-zinc-500">
              Masukkan nomor nota atau nama pelanggan (minimal 2 karakter).
            </p>
          </div>
          <Link href="/" className="text-xs font-semibold text-[var(--brand-dark)] hover:underline">
            ← Beranda
          </Link>
        </div>

        <form
          onSubmit={handleSearch}
          className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <input
            type="text"
            required
            minLength={2}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Contoh: Budi atau LDR-261116"
            className="flex-1 rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-[var(--brand-dark)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            {loading ? 'Mencari...' : 'Lacak'}
          </button>
        </form>

        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {orders && orders.length === 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            Pesanan tidak ditemukan.
          </div>
        )}

        <div className="space-y-4">
          {(orders || []).map((ord, idx) => (
            <div
              key={`${ord.orderNumber}-${idx}`}
              className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-sm font-bold text-[var(--brand-dark)]">
                    {ord.orderNumber}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Pelanggan: {ord.customerDisplayName} • {ord.branchName}
                  </div>
                </div>
                <span className="rounded-full bg-[var(--brand-surface)] px-3 py-1 text-xs font-semibold text-[var(--brand-dark)]">
                  {ord.isPickedUp ? 'Sudah Diambil' : 'Dalam Proses / Siap Ambil'}
                </span>
              </div>

              <div className="space-y-3">
                {ord.items.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-zinc-100 bg-zinc-50 p-3"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{item.serviceName}</span>
                      <span className="text-[var(--brand-dark)]">
                        {item.statusLabel}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.steps.map((s) => (
                        <span
                          key={s.code}
                          className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                            s.done
                              ? 'bg-[var(--brand-primary)] text-[var(--brand-dark)] font-medium'
                              : 'bg-zinc-200 text-zinc-500'
                          }`}
                        >
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
