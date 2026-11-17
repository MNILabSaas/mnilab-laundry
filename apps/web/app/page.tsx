'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DemoSandboxBar } from './components/DemoSandboxBar';
import { SubscriptionLockedScreen } from './components/SubscriptionLockedScreen';
import {
  applyTenantThemeToDom,
  formatRupiah,
  getActiveTenantSlug,
  getBranchSlug,
  laundryFetch,
  WORKFLOW_LABELS,
  type BranchItem,
  type LaundryServiceItem,
  type TenantBrandingInfo,
} from './lib/laundry-api';

export default function LaundryHomePage() {
  const [branding, setBranding] = useState<TenantBrandingInfo | null>(null);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [services, setServices] = useState<LaundryServiceItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const slug = getActiveTenantSlug();
    let active = true;
    Promise.all([
      laundryFetch<TenantBrandingInfo>('/public/branding', {
        headers: { 'X-Tenant-Slug': slug },
      }),
      laundryFetch<BranchItem[]>('/branches/public', {
        headers: { 'X-Tenant-Slug': slug },
      }).catch(() => []),
      laundryFetch<LaundryServiceItem[]>('/services/public', {
        headers: { 'X-Tenant-Slug': slug },
      }).catch(() => []),
    ])
      .then(([b, br, sv]) => {
        if (!active) return;
        setBranding(b);
        setBranches(br);
        setServices(sv);
        applyTenantThemeToDom(b.theme);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Gagal memuat tenant');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (branding && !branding.entitlement.allowed) {
    return <SubscriptionLockedScreen branding={branding} />;
  }

  return (
    <div className="min-h-screen bg-white text-[#454745]">
      {branding && (
        <DemoSandboxBar branding={branding} onPreviewChange={setBranding} />
      )}

      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding?.logoUrl || '/assets/logoLaundry.webp'}
              alt={branding?.brandName || 'MNILab Laundry'}
              className="h-9 w-9 rounded-xl object-cover border border-zinc-200"
            />
            <div>
              <div className="font-bold text-[var(--brand-dark)]">
                {branding?.brandName || 'MNILab Laundry'}
              </div>
              <div className="text-[11px] text-zinc-500">
                {branding?.tagline || 'Mitra Laundry Terpercaya'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 text-xs font-semibold text-white"
            >
              Portal Pegawai / Owner
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-6 py-12">
        <section className="rounded-3xl bg-[var(--brand-surface)] p-8 sm:p-12">
          <span className="inline-block rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--brand-dark)]">
            MNILab Laundry OS
          </span>
          <h1 className="mt-4 text-3xl font-bold text-[var(--brand-dark)] sm:text-4xl">
            Layanan Laundry Higienis & Terlacak Real-Time
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-700">
            Pilih cabang terdekat untuk melihat daftar tarif layanan dan melacak
            status cucian Anda menggunakan nomor nota atau nama tanpa perlu login.
          </p>
          {error && (
            <p className="mt-3 text-xs text-amber-800">
              Info koneksi API: {error}
            </p>
          )}
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--brand-dark)]">
            Cabang & Cek Nota Publik
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {branches.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl border border-zinc-200 p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[var(--brand-dark)]">
                      {b.name}
                    </h3>
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-mono">
                      {b.code}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {b.address || 'Alamat cabang'} • {b.openTime} - {b.closeTime}
                  </p>
                </div>
                <Link
                  href={`/${getBranchSlug(b)}`}
                  className="mt-4 inline-block rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-center text-xs font-semibold text-[var(--brand-dark)]"
                >
                  Cek Nota Cabang Ini →
                </Link>
              </div>
            ))}
            {branches.length === 0 && (
              <p className="text-xs text-zinc-500">
                Belum ada cabang aktif pada tenant ini.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-[var(--brand-dark)]">
            Daftar Layanan
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-zinc-200 p-5"
              >
                <div className="text-xs font-medium text-zinc-500">
                  {WORKFLOW_LABELS[s.workflow]}
                </div>
                <div className="mt-1 font-semibold text-[var(--brand-dark)]">
                  {s.name}
                </div>
                <div className="mt-3 text-lg font-bold text-[var(--brand-dark)]">
                  {formatRupiah(s.price)}{' '}
                  <span className="text-xs font-normal text-zinc-500">
                    / {s.priceUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
