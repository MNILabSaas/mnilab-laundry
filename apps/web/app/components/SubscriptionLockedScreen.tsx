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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#F8FAFC] to-[#2C99D6]/[0.08] px-6 text-ink font-body">
      <div className="w-full max-w-lg rounded-2xl bg-snow border border-line p-8 text-center shadow-sm space-y-4">
        <span className="inline-block rounded-full bg-scarlet px-3.5 py-1 text-xs font-sub font-semibold text-snow">
          Akses Dikunci Sementara ({branding.entitlement.status})
        </span>
        <h1 className="font-heading text-2xl font-bold text-ink">
          {branding.brandName}
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          {branding.entitlement.reason ||
            'Masa aktif langganan bulanan untuk mitra ini telah jatuh tempo dan belum diperpanjang. Website tidak dapat diakses sementara, namun 100% data cabang, pelanggan, dan transaksi di database tetap tersimpan aman.'}
        </p>
        <div className="pt-3 flex flex-col sm:flex-row justify-center gap-3">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-scarlet hover:bg-scarlet-dark shadow-lg shadow-scarlet/25 px-6 py-3 text-sm font-sub font-semibold text-snow transition-all"
          >
            Hubungi Admin WhatsApp →
          </a>
          <a
            href={platformUrl}
            className="rounded-xl bg-brand-dark hover:bg-ink px-5 py-3 text-sm font-sub font-semibold text-snow transition-colors"
          >
            Halaman MNILab Platform
          </a>
        </div>
      </div>
    </main>
  );
}
