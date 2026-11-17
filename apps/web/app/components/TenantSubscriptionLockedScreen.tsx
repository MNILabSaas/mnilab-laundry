'use client';

import Link from 'next/link';
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
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0b1408 0%, #13220d 55%, #091006 100%)',
        color: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '1.5rem',
          padding: '2.25rem 2rem',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.45)',
          textAlign: 'center',
        }}
      >
        {/* Logo & Nama Mitra */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 1rem',
            borderRadius: '999px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '1.25rem',
          }}
        >
          <img
            src={branding.logoUrl || '/Assets/logoLaundry.webp'}
            alt={branding.brandName}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              objectFit: 'cover',
              background: '#fff',
            }}
          />
          <span
            style={{
              fontWeight: 800,
              fontSize: '0.92rem',
              color: '#ffffff',
            }}
          >
            {branding.brandName}
          </span>
        </div>

        {/* Badge Status */}
        <div style={{ marginBottom: '1rem' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '0.35rem 0.9rem',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: isExpired
                ? 'rgba(239, 68, 68, 0.18)'
                : 'rgba(245, 158, 11, 0.18)',
              color: isExpired ? '#fca5a5' : '#fcd34d',
              border: isExpired
                ? '1px solid rgba(239, 68, 68, 0.35)'
                : '1px solid rgba(245, 158, 11, 0.35)',
            }}
          >
            {isExpired
              ? 'Masa Berlangganan Jatuh Tempo (Auto-Stop)'
              : 'Layanan Berlangganan Dihentikan Sementara'}
          </span>
        </div>

        <h1
          style={{
            fontSize: '1.55rem',
            fontWeight: 800,
            lineHeight: 1.3,
            margin: '0 0 0.75rem',
            color: '#ffffff',
          }}
        >
          Website & Sistem Pelanggan Sedang Tidak Dapat Diakses
        </h1>

        <p
          style={{
            fontSize: '0.92rem',
            lineHeight: 1.65,
            color: 'rgba(255, 255, 255, 0.76)',
            margin: '0 0 1.35rem',
          }}
        >
          {isExpired ? (
            <>
              Masa berlangganan bulanan untuk domain{' '}
              <strong style={{ color: '#fde047' }}>{subdomainHost}</strong> telah
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
              <strong style={{ color: '#fde047' }}>{subdomainHost}</strong>{' '}
              sedang dihentikan sementara (NON-AKTIF) oleh Administrator Platform
              MNILab.
            </>
          )}
        </p>

        {/* Jaminan Data Tetap Tersimpan Aman */}
        <div
          style={{
            textAlign: 'left',
            padding: '1rem 1.15rem',
            borderRadius: '1rem',
            background: 'rgba(159, 232, 112, 0.08)',
            border: '1px solid rgba(159, 232, 112, 0.25)',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: '0.84rem',
              color: '#9fe870',
              marginBottom: '0.35rem',
            }}
          >
            Data Bisnis & Riwayat Transaksi Tetap Tersimpan Aman
          </div>
          <p
            style={{
              margin: 0,
              fontSize: '0.8rem',
              lineHeight: 1.55,
              color: 'rgba(255, 255, 255, 0.82)',
            }}
          >
            Bagi Pemilik / Super Owner <strong>{branding.brandName}</strong>:
            seluruh data cabang, akun kasir/pegawai, pelanggan, dan riwayat nota
            di database Anda <strong>tetap utuh 100%</strong>. Saat langganan
            bulanan diperpanjang kembali, website dan portal operasional akan
            langsung aktif tanpa perlu mengatur ulang dari awal.
          </p>
        </div>

        {/* Tombol Aksi */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            justifyContent: 'center',
          }}
        >
          <a
            href={`https://wa.me/${cleanWa}?text=${waText}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.75rem 1.35rem',
              borderRadius: '0.85rem',
              background: '#9fe870',
              color: '#163300',
              fontWeight: 800,
              fontSize: '0.86rem',
              textDecoration: 'none',
            }}
          >
            Hubungi Admin MNILab (Perpanjang Langganan)
          </a>
          <a
            href={PLATFORM_WEB_URL}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.75rem 1.2rem',
              borderRadius: '0.85rem',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.84rem',
              textDecoration: 'none',
            }}
          >
            Info Platform MNILab
          </a>
        </div>
      </div>
    </div>
  );
}
