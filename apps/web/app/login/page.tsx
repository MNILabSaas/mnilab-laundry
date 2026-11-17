'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import {
  applyTenantThemeToDom,
  getActiveTenantSlug,
  laundryFetch,
  setActiveTenantSlug,
  type TenantBrandingInfo,
} from '../lib/laundry-api';

export default function LaundryLoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState(() => getActiveTenantSlug());
  const [branding, setBranding] = useState<TenantBrandingInfo | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const slug = getActiveTenantSlug();
    let active = true;
    laundryFetch<TenantBrandingInfo>('/public/branding', {
      headers: { 'X-Tenant-Slug': slug },
    })
      .then((res) => {
        if (!active) return;
        setBranding(res);
        applyTenantThemeToDom(res.theme);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setActiveTenantSlug(tenantSlug);
      await laundryFetch('/auth/login', {
        method: 'POST',
        headers: { 'X-Tenant-Slug': tenantSlug },
        body: JSON.stringify({ tenantSlug, identifier, password }),
      });
      router.push('/portal');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#f6f9f4] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding?.logoUrl || '/assets/logoLaundry.webp'}
            alt={branding?.brandName || 'MNILab Laundry'}
            className="h-11 w-11 rounded-xl object-cover border border-zinc-200"
          />
          <div>
            <h1 className="text-lg font-bold text-[#163300]">
              {branding?.brandName || 'MNILab Laundry Portal'}
            </h1>
            <p className="text-xs text-zinc-500">
              Portal Operasional Kasir, Cuci, Setrika & Owner
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700">
              Kode / Slug Mitra
            </label>
            <input
              type="text"
              required
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">
              Email atau Nomor HP
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#163300] py-2.5 text-sm font-semibold text-white hover:bg-[#054d28] transition disabled:opacity-50"
          >
            {loading ? 'Memverifikasi...' : 'Masuk Portal'}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-zinc-500">
          <Link href="/" className="hover:underline">
            ← Kembali ke Halaman Mitra
          </Link>
        </div>
      </div>
    </main>
  );
}
