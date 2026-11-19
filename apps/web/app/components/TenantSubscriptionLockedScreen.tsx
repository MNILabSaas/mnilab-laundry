'use client';

import {
  formatTenantSubdomainHost,
  PLATFORM_WEB_URL,
  type TenantBranding,
} from '../lib/api';

interface TenantSubscriptionLockedScreenProps {
  branding: TenantBranding;
  supportWhatsapp?: string;
}

export default function TenantSubscriptionLockedScreen({
  branding,
  supportWhatsapp = '6281234567890',
}: TenantSubscriptionLockedScreenProps) {
  const status = (branding.tenantStatus || 'STOPPED').toUpperCase();
  const isExpired =
    status === 'EXPIRED' ||
    Boolean(
      branding.subscriptionEndAt &&
        new Date(branding.subscriptionEndAt).getTime() <= Date.now(),
    );
  const subdomainHost = formatTenantSubdomainHost(
    branding.brandName,
    branding.slug,
  );
  const cleanWa = supportWhatsapp.replace(/[^0-9]/g, '') || '6281234567890';
  const waText = encodeURIComponent(
    `Halo Admin MNILab, saya ingin memperpanjang / mengaktifkan kembali langganan bulanan untuk mitra "${branding.brandName}" (${subdomainHost}).`,
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F8FAFC] to-[#2C99D6]/[0.08] text-ink flex items-center justify-center p-6 font-body">
      <div className="w-full max-w-[580px] bg-snow border border-line rounded-2xl p-8 sm:p-9 shadow-sm text-center">
        {/* Logo & Nama Mitra */}
        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-line bg-white mb-5">
          <img
            src={
              branding.logoUrl ||
              (branding.isDemo
                ? '/assets/logoDemoLaundry.webp'
                : '/assets/logoLaundry.webp')
            }
            alt={branding.brandName}
            className="w-8 h-8 rounded-full object-cover bg-white border border-line"
          />
          <span className="font-sub font-semibold text-[15px] text-ink">
            {branding.brandName}
          </span>
        </div>

        {/* Badge Status */}
        <div className="mb-4">
          <span className="inline-block px-3.5 py-1 rounded-full text-[11px] font-sub font-semibold tracking-wider uppercase bg-scarlet text-snow">
            {isExpired
              ? 'Masa Berlangganan Jatuh Tempo (Auto-Stop)'
              : 'Layanan Berlangganan Dihentikan Sementara'}
          </span>
        </div>

        <h1 className="font-heading text-[24px] sm:text-[28px] font-bold leading-snug mb-3 text-ink">
          Website &amp; Sistem Pelanggan Sedang Tidak Dapat Diakses
        </h1>

        <p className="text-[15px] leading-relaxed text-muted mb-6">
          {isExpired ? (
            <>
              Masa berlangganan bulanan untuk domain{' '}
              <strong className="text-ink">{subdomainHost}</strong> telah
              melewati tanggal jatuh tempo{' '}
              {branding.subscriptionEndAt
                ? `(${new Date(branding.subscriptionEndAt).toLocaleDateString(
                    'id-ID',
                    {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    },
                  )})`
                : ''}{' '}
              dan otomatis dihentikan sementara oleh sistem.
            </>
          ) : (
            <>
              Layanan berlangganan bulanan untuk domain{' '}
              <strong className="text-ink">{subdomainHost}</strong>{' '}
              sedang dihentikan sementara (NON-AKTIF) oleh Administrator Platform
              MNILab.
            </>
          )}
        </p>

        {/* Jaminan Data Tetap Tersimpan Aman */}
        <div className="text-left p-4 rounded-xl bg-white border border-line mb-6">
          <div className="font-sub font-semibold text-[14px] text-brand-dark mb-1">
            Data Bisnis &amp; Riwayat Transaksi Tetap Tersimpan Aman
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            Bagi Pemilik / Super Owner <strong className="text-ink">{branding.brandName}</strong>:
            seluruh data cabang, akun kasir/pegawai, pelanggan, dan riwayat nota
            di database Anda <strong className="text-ink">tetap utuh 100%</strong>. Saat langganan
            bulanan diperpanjang kembali, website dan portal operasional akan
            langsung aktif tanpa perlu mengatur ulang dari awal.
          </p>
        </div>

        {/* Tombol Aksi */}
        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href={`https://wa.me/${cleanWa}?text=${waText}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-scarlet hover:bg-scarlet-dark text-snow font-sub font-semibold text-[14px] shadow-lg shadow-scarlet/25 transition-all"
          >
            Hubungi Admin MNILab (Perpanjang Langganan)
          </a>
          <a
            href={PLATFORM_WEB_URL}
            className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-brand-dark hover:bg-ink text-snow font-sub font-semibold text-[14px] transition-colors"
          >
            Info Platform MNILab
          </a>
        </div>
      </div>
    </div>
  );
}
