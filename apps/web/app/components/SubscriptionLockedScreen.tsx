'use client';

import type { TenantBrandingInfo } from '../lib/laundry-api';

export function SubscriptionLockedScreen({
  branding,
}: {
  branding: TenantBrandingInfo;
}) {
  const platformUrl =
    process.env.NEXT_PUBLIC_PLATFORM_URL || 'http://localhost:3000';

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0b1408] px-6 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-white/5 p-8 text-center shadow-2xl">
        <span className="inline-block rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-200">
          Status Langganan: {branding.entitlement.status}
        </span>
        <h1 className="mt-4 text-2xl font-bold">{branding.brandName}</h1>
        <p className="mt-3 text-sm text-zinc-300">
          {branding.entitlement.reason ||
            'Akses operasional untuk mitra ini sementara ditangguhkan karena masa aktif langganan berakhir.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={`${platformUrl}/dashboard`}
            className="rounded-xl bg-[#9fe870] px-5 py-2.5 text-sm font-semibold text-[#163300] hover:bg-[#8ee05c]"
          >
            Perpanjang di MNILab Platform
          </a>
        </div>
      </div>
    </main>
  );
}
