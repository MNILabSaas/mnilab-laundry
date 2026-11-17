'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  apiFetch,
  type AuthUser,
  setActiveTenantSlug,
  setAuthSession,
  type TenantBranding,
} from '../../lib/api';

function SsoExchangeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('code')?.trim() || '';
  const [error, setError] = useState<string | null>(
    code ? null : 'Launch code SSO tidak ditemukan.',
  );

  useEffect(() => {
    if (!code) return;
    let active = true;
    apiFetch<{ user?: AuthUser; tenant?: TenantBranding }>('/auth/sso/exchange', {
      method: 'POST',
      body: JSON.stringify({ launchCode: code }),
    })
      .then((res) => {
        if (!active) return;
        if (res?.tenant?.slug) {
          setActiveTenantSlug(res.tenant.slug);
        }
        if (res?.user) {
          setAuthSession(res.user, res.tenant);
        }
        router.replace('/portal');
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Verifikasi SSO Platform gagal',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [code, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f6f9f4] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-bold text-[#163300]">
          Menghubungkan Sesi MNILab
        </h1>
        {error ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
              {error}
            </p>
            <Link
              href="/portal"
              className="inline-block rounded-xl bg-[#163300] px-4 py-2 text-xs font-semibold text-white"
            >
              Ke Halaman Portal Laundry
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">
            Memvalidasi token autentikasi dan entitlement tenant...
          </p>
        )}
      </div>
    </main>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-zinc-500">
          Memuat...
        </div>
      }
    >
      <SsoExchangeContent />
    </Suspense>
  );
}
