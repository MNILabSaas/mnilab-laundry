'use client';

import type { TenantBrandingInfo } from '../lib/laundry-api';

export function SubscriptionLockedScreen({
  branding,
}: {
  branding: TenantBrandingInfo;
}) {
  const platformUrl = (
    process.env.NEXT_PUBLIC_PLATFORM_URL || 'http://localhost:3000'
  ).replace(/\/$/, '');

  const waUrl = `https://wa.me/6281217395849?text=${encodeURIComponent(
    `Halo Admin MNILab, saya ingin memperpanjang / mengaktifkan kembali langganan untuk ${branding.brandName} (${branding.slug}).`,
  )}`;

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#08080a] px-6 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-[#2e3038] bg-[#121317] p-8 text-center shadow-2xl space-y-4">
        <span className="inline-block rounded-full bg-[#cb272f]/25 border border-[#cb272f] px-3.5 py-1 text-xs font-bold text-[#ffd6d8]">
          Akses Dikunci Sementara ({branding.entitlement.status})
        </span>
        <h1 className="text-2xl font-bold text-white">{branding.brandName}</h1>
        <p className="text-sm text-[#acafb9] leading-relaxed">
          {branding.entitlement.reason ||
            'Masa aktif langganan bulanan untuk mitra ini telah jatuh tempo dan belum diperpanjang. Website tidak dapat diakses sementara, namun 100% data cabang, pelanggan, dan transaksi di database tetap tersimpan aman.'}
        </p>
        <div className="pt-3 flex flex-col sm:flex-row justify-center gap-3">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-white px-6 py-3 text-sm font-bold text-black hover:bg-zinc-200 transition"
          >
            Hubungi Admin WhatsApp →
          </a>
          <a
            href={platformUrl}
            className="rounded-full border border-[#2e3038] px-5 py-3 text-sm font-medium text-zinc-300 hover:text-white transition"
          >
            Halaman MNILab Platform
          </a>
        </div>
      </div>
    </main>
  );
}
