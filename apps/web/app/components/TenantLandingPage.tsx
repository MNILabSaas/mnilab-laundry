'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import TransparentHeroVideo from '../TransparentHeroVideo';
import {
  DemoBranchMode,
  DemoSandboxBar,
  getStoredDemoBranchMode,
  getStoredDemoSandboxBranding,
  setStoredDemoBranchMode,
} from './DemoSandboxBar';
import TenantSubscriptionLockedScreen from './TenantSubscriptionLockedScreen';
import LandingFeatureIcon from './LandingFeatureIcon';
import {
  apiFetch,
  applyTenantThemeToDom,
  BAGUS_LAUNDRY_DEFAULT_BRANDING,
  Branch,
  buildBranchTrackingHref,
  DEFAULT_LANDING_FEATURES,
  DEFAULT_LANDING_HERO_DESC,
  DEFAULT_LANDING_SLOGAN,
  FeatureHighlightItem,
  findMatchingBranchBySlug,
  formatBranchPublicUrl,
  formatRupiah,
  formatTenantSubdomainHost,
  getActiveTenantSlug,
  getBranchSlug,
  getStoredTenantBranding,
  isTenantBrandingBlocked,
  LaundryServiceItem,
  PLATFORM_WEB_URL,
  PublicTrackedOrder,
  setActiveTenantSlug,
  setStoredTenantBranding,
  TenantBranding,
  TenantLandingConfig,
  WORKFLOW_LABELS,
} from '../lib/api';

const FALLBACK_SERVICES: LaundryServiceItem[] = [
  {
    id: 'demo-1',
    name: 'Cuci Kering Setrika',
    description:
      'Cuci bersih higienis, dikeringkan mesin, dan disetrika uap rapi dengan parfum tahan lama.',
    workflow: 'WASH_IRON',
    priceUnit: 'KG',
    price: 7000,
    minWeightKg: 3,
    estimatedDurationHours: 48,
    isActive: true,
  },
  {
    id: 'demo-2',
    name: 'Cuci Kering Lipat',
    description:
      'Pakaian dicuci bersih, dikeringkan penuh, dan dilipat rapi siap masuk lemari tanpa setrika.',
    workflow: 'WASH_DRY',
    priceUnit: 'KG',
    price: 5500,
    minWeightKg: 3,
    estimatedDurationHours: 24,
    isActive: true,
  },
  {
    id: 'demo-3',
    name: 'Cuci Mamel (Basah)',
    description:
      'Proses pencucian bersih dan peras mesin menggunakan deterjen pilihan, siap dijemur di rumah.',
    workflow: 'WASH_WET',
    priceUnit: 'KG',
    price: 4000,
    minWeightKg: 3,
    estimatedDurationHours: 12,
    isActive: true,
  },
  {
    id: 'demo-4',
    name: 'Setrika Uap Saja',
    description:
      'Layanan setrika uap rapi dan parfum untuk pakaian yang sudah dicuci dari rumah.',
    workflow: 'IRON_ONLY',
    priceUnit: 'KG',
    price: 4500,
    minWeightKg: 3,
    estimatedDurationHours: 24,
    isActive: true,
  },
  {
    id: 'demo-5',
    name: 'Cuci Satuan & Bedcover',
    description:
      'Penanganan khusus per potong untuk bedcover, selimut tebal, jas, jaket, dan kebaya.',
    workflow: 'WASH_IRON_ITEM',
    priceUnit: 'ITEM',
    price: 15000,
    minWeightKg: null,
    estimatedDurationHours: 48,
    isActive: true,
  },
];

type UnitFilter = 'ALL' | 'KG' | 'ITEM';

interface TenantLandingPageProps {
  /** Slug cabang dari URL (contoh: /pusat). Kosong = halaman utama perusahaan. */
  branchSlug?: string;
}

export default function TenantLandingPage({ branchSlug }: TenantLandingPageProps) {
  const rawBranchSlug = (branchSlug || '').trim();
  const isBranchRoute = rawBranchSlug.length > 0;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<'beranda' | 'lacak' | 'harga' | 'lokasi'>('beranda');
  const [unitFilter, setUnitFilter] = useState<UnitFilter>('ALL');
  const [services, setServices] = useState<LaundryServiceItem[]>(FALLBACK_SERVICES);
  const [publicBranches, setPublicBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [baseBranding, setBaseBranding] = useState<TenantBranding>(BAGUS_LAUNDRY_DEFAULT_BRANDING);
  const [branding, setBranding] = useState<TenantBranding>(BAGUS_LAUNDRY_DEFAULT_BRANDING);
  const [allTenants, setAllTenants] = useState<TenantBranding[]>([]);
  const [demoBranchMode, setDemoBranchMode] = useState<DemoBranchMode>('WITH_BRANCHES');
  const [currentYear, setCurrentYear] = useState(2026);
  const [query, setQuery] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackedOrders, setTrackedOrders] = useState<PublicTrackedOrder[] | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
    setDemoBranchMode(getStoredDemoBranchMode());
    const stored = getStoredTenantBranding();
    setBaseBranding(stored);
    setBranding(stored);
    applyTenantThemeToDom(stored);
  }, []);

  function loadTenantLandingData(slug?: string) {
    if (slug) setActiveTenantSlug(slug);
    const activeSlug = slug || getActiveTenantSlug();
    apiFetch<TenantBranding>(`/tenants/public/${encodeURIComponent(activeSlug)}`)
      .then((res) => {
        if (res) {
          setBaseBranding(res);
          setStoredTenantBranding(res);
          if (res.isDemo || res.slug === 'demo-laundry') {
            const sandbox = getStoredDemoSandboxBranding(res);
            if (sandbox) {
              setBranding(sandbox);
              applyTenantThemeToDom(sandbox);
              return;
            }
          }
          setBranding(res);
        }
      })
      .catch(() => {
        // Fallback ke Bagus Laundry default
      });
    apiFetch<TenantBranding[]>('/tenants/public')
      .then((list) => {
        if (list && list.length > 0) setAllTenants(list);
      })
      .catch(() => {});
    setLoadingBranches(true);
    apiFetch<Branch[]>('/branches/public')
      .then((res) => {
        setPublicBranches(res && res.length > 0 ? res : []);
      })
      .catch(() => {
        setPublicBranches([]);
      })
      .finally(() => setLoadingBranches(false));
  }

  useEffect(() => {
    loadTenantLandingData();
  }, []);

  const isDemoTenant = Boolean(
    branding.isDemo || branding.slug === 'demo-laundry',
  );

  // Dalam mode Demo, user bisa mensimulasikan kondisi "Belum Bikin Cabang" (0 cabang) vs "Sudah Bikin Cabang"
  const effectiveBranches = useMemo(
    () => (isDemoTenant && demoBranchMode === 'NO_BRANCHES' ? [] : publicBranches),
    [isDemoTenant, demoBranchMode, publicBranches],
  );

  // Cabang aktif hanya ada pada rute /{slugCabang}; bila cabang dihapus → kembali ke tampilan daftar cabang
  const activeBranch = useMemo(
    () =>
      isBranchRoute
        ? findMatchingBranchBySlug(effectiveBranches, rawBranchSlug, branding.brandName)
        : null,
    [isBranchRoute, effectiveBranches, rawBranchSlug, branding.brandName],
  );
  const focusBranch: Branch | undefined = activeBranch || effectiveBranches[0];
  const activeBranchId = activeBranch?.id;

  // Harga mengikuti cabang aktif (layanan khusus cabang + layanan umum perusahaan)
  useEffect(() => {
    const path = activeBranchId
      ? `/services/public?branchId=${encodeURIComponent(activeBranchId)}`
      : '/services/public';
    apiFetch<LaundryServiceItem[]>(path)
      .then((res) => {
        setServices(res && res.length > 0 ? res : FALLBACK_SERVICES);
      })
      .catch(() => {
        // Fallback ke katalog standar bila server backend belum aktif
      });
  }, [activeBranchId, branding.slug]);

  const filteredServices = useMemo(() => {
    if (unitFilter === 'ALL') return services;
    return services.filter((svc) => svc.priceUnit === unitFilter);
  }, [services, unitFilter]);

  const demoSampleReceipts = useMemo(() => {
    if (!isDemoTenant || !activeBranch) return [];
    if (activeBranch.isMain || activeBranch.code === 'LUM-01') {
      return [
        { code: 'LDR-DEMO-1001', label: 'LDR-DEMO-1001 (Sedang Dicuci)' },
        { code: 'LDR-DEMO-1002', label: 'LDR-DEMO-1002 (Sedang Disetrika)' },
      ];
    }
    return [{ code: 'LDR-DEMO-1003', label: 'LDR-DEMO-1003 (Selesai / Rak A-04)' }];
  }, [isDemoTenant, activeBranch]);

  async function runTrackingSearch(searchKeyword: string) {
    if (!activeBranch) return;
    const trimmed = searchKeyword.trim();
    if (trimmed.length < 2) {
      setTrackingError('Masukkan minimal 2 karakter nama pelanggan atau nomor nota.');
      return;
    }
    setTrackingLoading(true);
    setTrackingError(null);
    try {
      const data = await apiFetch<PublicTrackedOrder[]>(
        `/public/laundry-tracking?q=${encodeURIComponent(trimmed)}&branchId=${encodeURIComponent(activeBranch.id)}`,
      );
      setTrackedOrders(data);
    } catch (err) {
      setTrackingError(
        err instanceof Error ? err.message : 'Gagal memuat status cucian cabang ini.',
      );
      setTrackedOrders([]);
    } finally {
      setTrackingLoading(false);
    }
  }

  async function handleTrack(e: FormEvent) {
    e.preventDefault();
    await runTrackingSearch(query);
  }

  if (isTenantBrandingBlocked(branding)) {
    return <TenantSubscriptionLockedScreen branding={branding} />;
  }

  const companySubdomainHost = formatTenantSubdomainHost(
    branding.brandName,
    branding.slug,
  );
  const tenantContactPhone = branding.whatsappPhone || '';
  const lacakNavLabel = activeBranch ? 'Cek Nota' : 'Cabang & Cek Nota';
  const lacakCtaLabel = activeBranch ? 'Cek Nota Sekarang' : 'Pilih Cabang & Cek Nota';

  function handleSwitchDemoBranchMode(mode: DemoBranchMode) {
    setDemoBranchMode(mode);
    setStoredDemoBranchMode(mode);
    setTrackedOrders(null);
    setTrackingError(null);
  }

  // Kustomisasi Landing Page (Prioritas: Pengaturan Khusus Cabang -> Pengaturan Perusahaan -> Template Standar)
  const tenantLandingConfig: TenantLandingConfig | undefined =
    branding.landingConfig || branding.theme?.landingConfig;

  const branchLandingConfig: TenantLandingConfig | undefined =
    activeBranch?.landingConfigJson || undefined;

  const effectiveHeroSlogan =
    branchLandingConfig?.heroSlogan?.trim() ||
    tenantLandingConfig?.heroSlogan?.trim() ||
    DEFAULT_LANDING_SLOGAN;

  const effectiveHeroDesc =
    branchLandingConfig?.heroDescription?.trim() ||
    tenantLandingConfig?.heroDescription?.trim() ||
    `${branding.tagline || 'The Best Partner in Laundry Service'}. ${DEFAULT_LANDING_HERO_DESC}`;

  const effectiveFeatures: FeatureHighlightItem[] = useMemo(() => {
    if (
      branchLandingConfig?.features &&
      Array.isArray(branchLandingConfig.features) &&
      branchLandingConfig.features.length === 3
    ) {
      return branchLandingConfig.features;
    }
    if (
      tenantLandingConfig?.features &&
      Array.isArray(tenantLandingConfig.features) &&
      tenantLandingConfig.features.length === 3
    ) {
      return tenantLandingConfig.features;
    }
    return DEFAULT_LANDING_FEATURES;
  }, [branchLandingConfig, tenantLandingConfig]);

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#454745]">
      {isDemoTenant && (
        <DemoSandboxBar
          baseBranding={baseBranding}
          activeBranding={branding}
          onPreviewChange={setBranding}
          currentArea="landing"
          onBranchModeChange={handleSwitchDemoBranchMode}
        />
      )}

      {/* Sticky Top Navigation Bar (64px height, pill segments, Forest Ink & Lime Voltage) */}
      <header className="bg-[#ffffff] border-b border-[#e8ebe6] sticky top-0 z-30">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a
            href="#beranda"
            onClick={() => setActiveNav('beranda')}
            className="flex items-center gap-3 group"
          >
            <img
              src={branding.logoUrl || '/Assets/logoLaundry.webp'}
              alt={`Logo ${branding.brandName}`}
              className="w-10 h-10 rounded-full object-cover shadow-[0_0_0_1px_rgba(14,15,12,0.12)]"
            />
            <div className="leading-none">
              <span className="block font-black text-[18px] tracking-[-0.02em] text-[#163300] uppercase">
                {branding.brandName}
              </span>
              <span className="block text-[11px] font-medium text-[#6a6c6a] mt-0.5">
                {branding.tagline || 'The Best Partner in Laundry Service'}
              </span>
            </div>
          </a>

          {/* Segmented Pill Switcher (Desktop) */}
          <nav
            aria-label="Navigasi Utama"
            className="hidden md:flex items-center bg-[#e8ebe6] p-1 rounded-full gap-1"
          >
            {(
              [
                { id: 'beranda', label: 'Beranda' },
                { id: 'lacak', label: lacakNavLabel },
                { id: 'harga', label: 'Daftar Harga' },
                { id: 'lokasi', label: 'Lokasi' },
              ] as const
            ).map((item) => {
              const isActive = activeNav === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setActiveNav(item.id)}
                  className={`px-4 py-1.5 rounded-full text-[14px] font-medium transition-colors ${
                    isActive
                      ? 'bg-[#9fe870] text-[#163300]'
                      : 'text-[#454745] hover:text-[#163300] hover:bg-[#e2f6d5]'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Right Cluster */}
          <div className="flex items-center gap-3">
            <span className="hidden lg:inline-block text-[14px] text-[#6a6c6a] font-medium">
              {focusBranch?.openTime || '08:00'} – {focusBranch?.closeTime || '21:00'} WIB
            </span>
            <Link
              href={`/portal?tenant=${encodeURIComponent(branding.slug)}`}
              className="bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] text-[14px] font-medium px-4 py-2 rounded-full transition-colors"
            >
              Portal Masuk
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Buka menu navigasi"
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-2 rounded-full border border-[#868685] text-[#163300] hover:bg-[#e8ebe6]"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={
                    mobileMenuOpen
                      ? 'M6 18L18 6M6 6l12 12'
                      : 'M4 6h16M4 12h16M4 18h16'
                  }
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#e8ebe6] bg-[#ffffff] px-4 py-3 flex flex-col gap-1">
            {(
              [
                { id: 'beranda', label: 'Beranda' },
                { id: 'lacak', label: lacakNavLabel },
                { id: 'harga', label: 'Daftar Harga' },
                { id: 'lokasi', label: 'Lokasi Workshop' },
              ] as const
            ).map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => {
                  setActiveNav(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`px-4 py-2.5 rounded-full text-[15px] font-medium ${
                  activeNav === item.id
                    ? 'bg-[#9fe870] text-[#163300]'
                    : 'text-[#454745] hover:bg-[#e2f6d5]'
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* HERO SECTION — Welcome text + video KV muat dalam satu layar */}
        <section
          id="beranda"
          className="scroll-mt-20 max-w-[1200px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24"
        >
          <div className="min-h-[calc(100svh-64px)] grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] items-center gap-4 lg:gap-8 py-6 lg:py-8">
            <div className="text-center lg:text-left">
              {/* Pill Tag */}
              <div className="inline-flex items-center gap-2 bg-[#e2f6d5] text-[#163300] text-[12px] font-medium px-3.5 py-1.5 rounded-full mb-4 lg:mb-6">
                <span className="w-2 h-2 rounded-full bg-[#163300]" />
                <span>
                  {branding.brandName}
                  {activeBranch
                    ? ` • ${activeBranch.name}`
                    : branding.cityOrRegion
                      ? ` • ${branding.cityOrRegion}`
                      : ''}
                </span>
              </div>

              {/* Welcome Text Page Headline */}
              <h1 className="font-black text-[#0e0f0c] text-[34px] sm:text-[52px] lg:text-[64px] xl:text-[72px] leading-[0.92] tracking-[-0.035em] uppercase mb-3 lg:mb-4">
                SELAMAT DATANG DI {branding.brandName.toUpperCase()}
              </h1>

              <p className="font-bold text-[#163300] text-[16px] sm:text-[20px] tracking-[-0.01em] uppercase mb-3">
                {effectiveHeroSlogan}
              </p>

              <p className="max-w-xl mx-auto lg:mx-0 text-[15px] sm:text-[17px] leading-[1.5] tracking-[-0.007em] text-[#454745] mb-5 lg:mb-7">
                {effectiveHeroDesc}
              </p>

              {/* Primary CTA Pill + Underlined Text Link Pair */}
              <div className="hidden lg:flex items-center gap-6">
                <a
                  href="#lacak"
                  onClick={() => setActiveNav('lacak')}
                  className="inline-flex items-center justify-center bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-medium text-[16px] px-7 py-3 rounded-full transition-colors"
                >
                  {lacakCtaLabel}
                </a>
                <a
                  href="#harga"
                  onClick={() => setActiveNav('harga')}
                  className="inline-flex items-center justify-center text-[#163300] font-medium text-[16px] underline underline-offset-4 hover:text-[#054d28] py-2 transition-colors"
                >
                  Lihat daftar harga layanan
                </a>
              </div>
            </div>

            {/* Video KV — background menyatu dengan kanvas putih */}
            <div className="w-full">
              <TransparentHeroVideo />
            </div>

            {/* CTA versi mobile/tablet (di bawah video) */}
            <div className="flex lg:hidden flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
              <a
                href="#lacak"
                onClick={() => setActiveNav('lacak')}
                className="w-full sm:w-auto inline-flex items-center justify-center bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-medium text-[16px] px-7 py-3 rounded-full transition-colors"
              >
                {lacakCtaLabel}
              </a>
              <a
                href="#harga"
                onClick={() => setActiveNav('harga')}
                className="inline-flex items-center justify-center text-[#163300] font-medium text-[16px] underline underline-offset-4 hover:text-[#054d28] py-2 transition-colors"
              >
                Lihat daftar harga layanan
              </a>
            </div>
          </div>

          {/* 3-Column Feature Row (Icon dinamis 24px stroke #454745, 24px gap to heading, 8px gap to body) */}
          <div className="mt-4 sm:mt-8 pt-12 border-t border-[#e8ebe6] grid grid-cols-1 md:grid-cols-3 gap-8">
            {effectiveFeatures.map((feat, idx) => (
              <div key={idx}>
                <div className="w-11 h-11 rounded-full bg-[#e8ebe6] flex items-center justify-center mb-6">
                  <LandingFeatureIcon icon={feat.icon} className="w-6 h-6 text-[#163300]" />
                </div>
                <h2 className="text-[18px] font-bold text-[#0e0f0c] tracking-[-0.007em] mb-2">
                  {feat.title}
                </h2>
                <p className="text-[16px] leading-[1.5] text-[#6a6c6a]">
                  {feat.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* DARK SECTION CARD — Cabang & Cek Nota (Forest Ink #163300). Tampilan sama untuk domain perusahaan & domain cabang */}
        <section
          id="lacak"
          className="scroll-mt-20 max-w-[1200px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24"
        >
          {activeBranch ? (
            /* Domain cabang: {tenant}.mnilab.my.id/{cabang} → Cek Nota khusus cabang ini */
            <div className="bg-[#163300] rounded-[28px] p-6 sm:p-10 lg:p-12 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-6 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-[#9fe870] text-[#163300] text-[12px] font-black px-3 py-1 rounded-full uppercase">
                      {activeBranch.isMain ? 'CABANG PUSAT' : 'CABANG RESMI'} • {activeBranch.code}
                    </span>
                    <span className="bg-[#054d28] text-[#9fe870] text-[12px] font-medium px-3 py-1 rounded-full">
                      🕒 {activeBranch.openTime || '08:00'} – {activeBranch.closeTime || '21:00'} WIB
                    </span>
                  </div>

                  <h2 className="font-black text-[#9fe870] text-[32px] sm:text-[44px] leading-[1.05] tracking-[-0.02em] uppercase">
                    CEK NOTA — {activeBranch.name.toUpperCase()}
                  </h2>

                  <p className="text-[#ffffff] text-[15px] sm:text-[16px] leading-[1.5] opacity-90">
                    Masukkan nomor nota atau nama pelanggan untuk memantau status pencucian,
                    pengeringan, hingga setrika khusus pada outlet{' '}
                    <strong className="text-[#9fe870]">{activeBranch.name}</strong>
                    {activeBranch.address || branding.defaultAddress
                      ? ` (${activeBranch.address || branding.defaultAddress})`
                      : ''}
                    .
                  </p>
                </div>

                <div className="lg:col-span-6 bg-[#ffffff] rounded-[16px] p-5 sm:p-6 space-y-3">
                  <form onSubmit={handleTrack} className="space-y-3">
                    <label
                      htmlFor="branch-track-input"
                      className="block text-[14px] font-bold text-[#0e0f0c]"
                    >
                      Nomor Nota atau Nama Pelanggan ({activeBranch.name})
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        id="branch-track-input"
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Contoh: Nama Pelanggan atau No. Nota"
                        className="flex-1 rounded-[10px] border border-[#868685] px-4 py-3 text-[16px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                      />
                      <button
                        type="submit"
                        disabled={trackingLoading}
                        className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-bold text-[15px] px-6 py-3 rounded-full transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                      >
                        {trackingLoading ? 'Mencari...' : 'Cek Nota'}
                      </button>
                    </div>
                  </form>

                  {demoSampleReceipts.length > 0 && (
                    <div className="pt-2 border-t border-[#e8ebe6] space-y-1.5">
                      <div className="text-[11px] font-bold text-[#163300] uppercase">
                        ✦ Contoh Nomor Nota Demo di {activeBranch.name} (Klik untuk Tes):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {demoSampleReceipts.map((sample) => (
                          <button
                            key={sample.code}
                            type="button"
                            onClick={() => {
                              setQuery(sample.code);
                              void runTrackingSearch(sample.code);
                            }}
                            className="text-[12px] font-mono font-bold bg-[#e2f6d5] hover:bg-[#9fe870] text-[#163300] px-3 py-1 rounded-full cursor-pointer transition-colors"
                          >
                            {sample.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[12px] text-[#6a6c6a]">
                    Pencarian ini hanya menampilkan nota cucian yang terdaftar di{' '}
                    <strong>{activeBranch.name}</strong>.
                  </p>
                </div>
              </div>

              {trackingError && (
                <div className="bg-[#cb272f] text-[#ffffff] text-[14px] font-medium rounded-[10px] px-4 py-3">
                  {trackingError}
                </div>
              )}

              {trackedOrders !== null && !trackingError && (
                <div className="pt-6 border-t border-[#054d28] space-y-4">
                  {trackedOrders.length === 0 ? (
                    <div className="bg-[#054d28] rounded-[12px] p-5 text-[#ffffff] text-[15px]">
                      Data cucian tidak ditemukan di{' '}
                      <strong className="text-[#9fe870]">{activeBranch.name}</strong> untuk kata
                      kunci <strong className="text-[#9fe870]">&ldquo;{query}&rdquo;</strong>.
                      Pastikan Anda membuka link cabang yang tertera pada struk kasir.
                    </div>
                  ) : (
                    trackedOrders.map((ord) => (
                      <div
                        key={ord.orderNumber + ord.receivedAt}
                        className="bg-[#ffffff] text-[#454745] rounded-[14px] p-5 sm:p-6 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#e8ebe6]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12px] font-medium text-[#6a6c6a]">No. Nota</span>
                            <span className="font-mono font-bold text-[15px] text-[#0e0f0c] bg-[#e8ebe6] px-2.5 py-0.5 rounded-full">
                              {ord.orderNumber}
                            </span>
                            <span className="text-[#868685]">•</span>
                            <span className="text-[14px] text-[#454745]">
                              Pelanggan:{' '}
                              <strong className="text-[#0e0f0c]">{ord.customerDisplayName}</strong>
                            </span>
                            {ord.branchName && (
                              <span className="text-[11px] font-semibold bg-[#163300] text-[#9fe870] px-2.5 py-0.5 rounded-full">
                                {ord.branchName}
                              </span>
                            )}
                          </div>
                          <span className="text-[12px] font-medium bg-[#e2f6d5] text-[#163300] px-3 py-1 rounded-full">
                            Diterima:{' '}
                            {new Date(ord.receivedAt).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {ord.items.map((item, idx) => (
                            <div key={idx} className="bg-[#e8ebe6] rounded-[10px] p-4 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-bold text-[16px] text-[#0e0f0c]">
                                  {item.serviceName}
                                </div>
                                <span
                                  className={`text-[12px] font-medium px-3 py-1 rounded-full ${
                                    item.status === 'SELESAI'
                                      ? 'bg-[#9fe870] text-[#163300]'
                                      : 'bg-[#163300] text-[#9fe870]'
                                  }`}
                                >
                                  {item.statusLabel}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                                {item.steps.map((st, sIdx) => (
                                  <div key={st.code} className="flex items-center gap-2">
                                    <span
                                      className={`px-3 py-1 rounded-full font-medium ${
                                        st.done
                                          ? 'bg-[#e2f6d5] text-[#163300]'
                                          : st.active
                                            ? 'bg-[#9fe870] text-[#163300] font-bold'
                                            : 'bg-[#ffffff] text-[#868685]'
                                      }`}
                                    >
                                      {st.label}
                                    </span>
                                    {sIdx < item.steps.length - 1 && (
                                      <span className="text-[#868685]">→</span>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#6a6c6a]">
                                {item.ironingEmployeeName && (
                                  <span>
                                    Petugas Setrika:{' '}
                                    <strong className="text-[#0e0f0c]">{item.ironingEmployeeName}</strong>
                                  </span>
                                )}
                                {item.rackLocation && (
                                  <span>
                                    Lokasi Rak Ambil:{' '}
                                    <strong className="text-[#163300] bg-[#e2f6d5] px-2 py-0.5 rounded">
                                      {item.rackLocation}
                                    </strong>
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Domain perusahaan: {tenant}.mnilab.my.id → Pilih cabang (atau info belum ada cabang) */
            <div className="bg-[#163300] rounded-[28px] p-6 sm:p-10 lg:p-12 space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="inline-block bg-[#054d28] text-[#9fe870] text-[12px] font-medium px-3 py-1.5 rounded-full">
                      Cabang Laundry &amp; Cek Nota per Cabang
                    </span>
                    <span className="inline-block bg-[#ffffff]/10 text-[#e2f6d5] font-mono text-[11px] px-3 py-1 rounded-full">
                      {companySubdomainHost}
                    </span>
                  </div>
                  <h2 className="font-black text-[#9fe870] text-[32px] sm:text-[42px] leading-[1.05] tracking-[-0.02em] uppercase mb-3">
                    PILIH CABANG LAUNDRY UNTUK CEK NOTA
                  </h2>
                  <p className="text-[#ffffff] text-[15px] sm:text-[16px] leading-[1.5] opacity-90">
                    Halaman utama perusahaan ini menampilkan daftar cabang resmi{' '}
                    <strong className="text-[#9fe870]">{branding.brandName}</strong>. Setiap
                    cabang memiliki halaman pelacakan nota tersendiri sesuai nama cabangnya
                    (contoh:{' '}
                    <code className="bg-[#054d28] text-[#9fe870] px-2 py-0.5 rounded font-mono text-[13px]">
                      /{effectiveBranches[0] ? getBranchSlug(effectiveBranches[0], branding.brandName) : 'pusat'}
                    </code>
                    ).
                  </p>
                </div>

                {/* Interaktif Simulasi Khusus Demo: Belum Bikin Cabang vs Sudah Bikin Cabang */}
                {isDemoTenant && (
                  <div className="bg-[#054d28] border border-[#9fe870]/35 rounded-[16px] p-4 max-w-md w-full space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#9fe870]">
                        ✦ Simulasi Mode Cabang (Khusus Demo)
                      </span>
                      <span className="text-[10px] font-semibold bg-[#163300] text-[#ffffff] px-2.5 py-0.5 rounded-full">
                        {demoBranchMode === 'NO_BRANCHES' ? '0 Cabang' : `${publicBranches.length} Cabang`}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#e2f6d5] leading-relaxed">
                      Uji tampilan halaman perusahaan ketika Super Owner{' '}
                      <strong>belum membuat cabang</strong> (tidak bisa cek nota) vs{' '}
                      <strong>sudah membuat cabang</strong> (cek nota per cabang aktif):
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSwitchDemoBranchMode('NO_BRANCHES')}
                        className={`text-[12px] font-bold py-2 px-3 rounded-full cursor-pointer transition-all ${
                          demoBranchMode === 'NO_BRANCHES'
                            ? 'bg-[#cb272f] text-[#ffffff] shadow-sm'
                            : 'bg-[#163300] text-[#e2f6d5] hover:bg-[#0e2200]'
                        }`}
                      >
                        Belum Bikin Cabang
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchDemoBranchMode('WITH_BRANCHES')}
                        className={`text-[12px] font-bold py-2 px-3 rounded-full cursor-pointer transition-all ${
                          demoBranchMode === 'WITH_BRANCHES'
                            ? 'bg-[#9fe870] text-[#163300] shadow-sm'
                            : 'bg-[#163300] text-[#e2f6d5] hover:bg-[#0e2200]'
                        }`}
                      >
                        Sudah Bikin Cabang ({publicBranches.length})
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {isBranchRoute && !loadingBranches && effectiveBranches.length > 0 && (
                <div className="bg-[#054d28] text-[#e2f6d5] text-[13px] rounded-[12px] px-4 py-3">
                  Cabang <strong className="font-mono text-[#9fe870]">/{rawBranchSlug}</strong> tidak
                  ditemukan atau sudah tidak aktif. Silakan pilih cabang resmi di bawah ini.
                </div>
              )}

              {loadingBranches ? (
                <div className="bg-[#054d28] rounded-[18px] p-8 text-center text-[#e2f6d5] font-semibold">
                  Memuat informasi cabang {branding.brandName}...
                </div>
              ) : effectiveBranches.length === 0 ? (
                /* Belum ada cabang → hanya informasi untuk pelanggan, tanpa tombol */
                <div className="bg-[#ffffff] rounded-[18px] p-6 sm:p-8 text-[#0e0f0c] border-2 border-dashed border-[#9fe870]">
                  <div className="space-y-2 max-w-3xl">
                    <span className="inline-flex items-center gap-1.5 bg-[#cb272f]/10 text-[#cb272f] text-[12px] font-bold px-3 py-1 rounded-full">
                      <span>🔒</span>
                      <span>Cek Nota Online Belum Tersedia</span>
                    </span>
                    <h3 className="font-black text-[22px] sm:text-[26px] text-[#0e0f0c] uppercase tracking-[-0.01em]">
                      Cabang Belum Tersedia untuk Cek Nota Online
                    </h3>
                    <p className="text-[14px] sm:text-[15px] text-[#454745] leading-relaxed">
                      Saat ini halaman cek nota online{' '}
                      <strong className="text-[#163300]">{branding.brandName}</strong> belum
                      tersedia. Untuk menanyakan status cucian Anda, silakan hubungi langsung
                      cabang / outlet tempat Anda menitipkan cucian
                      {tenantContactPhone ? (
                        <>
                          {' '}atau WhatsApp{' '}
                          <strong className="text-[#163300]">{tenantContactPhone}</strong>
                        </>
                      ) : null}
                      .
                    </p>
                  </div>
                </div>
              ) : (
                /* Sudah ada cabang → kartu cabang & tombol Cek Nota tiap cabang */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                  {effectiveBranches.map((branch) => {
                    const branchSlugText = getBranchSlug(branch, branding.brandName);
                    const branchHref = buildBranchTrackingHref(
                      branch,
                      branding.slug,
                      branding.brandName,
                    );
                    return (
                      <div
                        key={branch.id}
                        className="bg-[#ffffff] rounded-[18px] p-6 flex flex-col justify-between gap-5 border border-[#e8ebe6] shadow-sm hover:border-[#9fe870] transition-all"
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {branch.isMain && (
                                <span className="bg-[#9fe870] text-[#163300] text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase">
                                  CABANG PUSAT
                                </span>
                              )}
                              <span className="bg-[#e8ebe6] text-[#163300] font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                                Kode: {branch.code}
                              </span>
                            </div>
                            <span className="text-[12px] font-semibold text-[#163300] bg-[#e2f6d5] px-3 py-1 rounded-full font-mono">
                              /{branchSlugText}
                            </span>
                          </div>

                          <div>
                            <h3 className="font-black text-[22px] text-[#0e0f0c] tracking-[-0.01em] uppercase">
                              {branch.name}
                            </h3>
                            <p className="text-[14px] text-[#454745] mt-1">
                              {branch.address || branding.defaultAddress || 'Alamat cabang operasional resmi'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#6a6c6a] pt-1">
                            <span>
                              🕒 Jam Buka:{' '}
                              <strong className="text-[#0e0f0c]">
                                {branch.openTime || '08:00'} – {branch.closeTime || '21:00'} WIB
                              </strong>
                            </span>
                            {(branch.whatsappNumber || branch.phone) && (
                              <span>
                                • WA:{' '}
                                <strong className="text-[#0e0f0c]">
                                  {branch.whatsappNumber || branch.phone}
                                </strong>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="pt-4 border-t border-[#e8ebe6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-[11px] text-[#6a6c6a] font-mono truncate">
                            {formatBranchPublicUrl(branding, branch)}
                          </div>
                          <Link
                            href={branchHref}
                            className="inline-flex items-center justify-center bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-bold text-[14px] px-5 py-2.5 rounded-full transition-colors shrink-0"
                          >
                            Cek Nota Cabang Ini →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* DAFTAR HARGA & KATALOG LAYANAN (#harga) */}
        <section
          id="harga"
          className="scroll-mt-20 max-w-[1200px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <span className="inline-block bg-[#e2f6d5] text-[#163300] text-[12px] font-medium px-3 py-1 rounded-full mb-3">
                Katalog &amp; Tarif Layanan{activeBranch ? ` • ${activeBranch.name}` : ''}
              </span>
              <h2 className="font-black text-[#0e0f0c] text-[36px] sm:text-[45px] leading-[1.1] tracking-[-0.02em] uppercase">
                PILIH LAYANAN CUCIAN
              </h2>
            </div>

            {/* Segmented Tab Control for Filtering */}
            <div
              role="tablist"
              aria-label="Filter kategori layanan"
              className="inline-flex items-center bg-[#e8ebe6] p-1 rounded-full self-start md:self-auto"
            >
              {(
                [
                  { id: 'ALL', label: 'Semua Layanan' },
                  { id: 'KG', label: 'Kiloan (Kg)' },
                  { id: 'ITEM', label: 'Satuan (Potong)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={unitFilter === tab.id}
                  onClick={() => setUnitFilter(tab.id)}
                  className={`px-4 py-2 rounded-full text-[14px] font-medium transition-colors cursor-pointer ${
                    unitFilter === tab.id
                      ? 'bg-[#9fe870] text-[#163300]'
                      : 'text-[#454745] hover:text-[#163300]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.map((svc) => (
              <div
                key={svc.id}
                className="bg-[#e8ebe6] rounded-[10px] p-6 flex flex-col justify-between transition-colors hover:bg-[#e2f6d5]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-[20px] text-[#0e0f0c] leading-[1.25] tracking-[-0.01em]">
                        {svc.name}
                      </h3>
                      {svc.isThirdParty && (
                        <span className="inline-block mt-1 bg-[#163300] text-[#9fe870] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                          Mitra Pihak Ke-3{svc.thirdPartyPartner ? `: ${svc.thirdPartyPartner}` : ''}
                        </span>
                      )}
                    </div>
                    <span className="bg-[#ffffff] text-[#163300] text-[12px] font-medium px-3 py-1 rounded-full shrink-0">
                      {WORKFLOW_LABELS[svc.workflow]}
                    </span>
                  </div>
                  <p className="text-[15px] text-[#454745] leading-[1.5]">
                    {svc.description || 'Layanan perawatan pakaian bersih, higienis, dan rapi.'}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-[#868685]/30 flex items-baseline justify-between">
                  <div>
                    <span className="text-[25px] font-bold text-[#0e0f0c] tracking-[-0.01em]">
                      {formatRupiah(svc.price)}
                    </span>
                    <span className="text-[14px] text-[#6a6c6a] font-medium">
                      {' '}
                      / {svc.priceUnit === 'KG' ? 'kg' : 'potong'}
                    </span>
                  </div>
                  <div className="text-right text-[12px] text-[#6a6c6a] font-medium">
                    {svc.minWeightKg ? `Min. ${svc.minWeightKg} kg` : 'Tanpa minimum'}
                    {svc.estimatedDurationHours ? ` • ~${svc.estimatedDurationHours} jam` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* LOKASI WORKSHOP (#lokasi) — Linen Mist Tinted Surface */}
        <section
          id="lokasi"
          className="scroll-mt-20 max-w-[1200px] mx-auto px-4 sm:px-6 pb-16 sm:pb-24"
        >
          <div className="bg-[#e2f6d5] rounded-[28px] p-6 sm:p-10 lg:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="max-w-xl">
              <span className="inline-block bg-[#163300] text-[#9fe870] text-[12px] font-medium px-3 py-1 rounded-full mb-4">
                {activeBranch ? activeBranch.name : 'Workshop Utama'} • {branding.brandName}
              </span>
              <h2 className="font-black text-[#163300] text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.02em] uppercase mb-3">
                {(focusBranch?.address || branding.defaultAddress || 'ALAMAT WORKSHOP RESMI BELUM DIATUR CABANG').toUpperCase()}
              </h2>
              <p className="text-[16px] text-[#163300] leading-[1.5]">
                Buka setiap hari pukul {focusBranch?.openTime || '08:00'} – {focusBranch?.closeTime || '21:00'} WIB. Tersedia penjemputan dan pengantaran
                gratis untuk pelanggan dalam radius 3 km.
              </p>
              {effectiveBranches.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {effectiveBranches.map((b) => (
                    <Link
                      key={b.id}
                      href={buildBranchTrackingHref(b, branding.slug, branding.brandName)}
                      className="text-xs font-semibold bg-[#ffffff] hover:bg-[#9fe870] text-[#163300] border border-[#163300]/20 px-3 py-1.5 rounded-full transition-colors"
                    >
                      {b.name}: {b.openTime || '08:00'}–{b.closeTime || '21:00'} WIB
                      {b.defaultMinWeightKg && Number(b.defaultMinWeightKg) > 0
                        ? ` • Min. ${b.defaultMinWeightKg} kg`
                        : ''}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 shrink-0">
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(focusBranch?.address || branding.defaultAddress || branding.brandName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#163300] hover:text-[#ffffff] font-medium text-[16px] px-6 py-3 rounded-full transition-colors"
              >
                Buka di Google Maps
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#e8ebe6] border-t border-[#868685]/20 py-10 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[14px] text-[#6a6c6a]">
          <div className="flex flex-wrap items-center gap-3">
            <img
              src={branding.logoUrl || '/Assets/logoLaundry.webp'}
              alt={`Logo ${branding.brandName}`}
              className="w-8 h-8 rounded-full object-cover shadow-[0_0_0_1px_rgba(14,15,12,0.12)]"
            />
            <span className="font-bold text-[#163300]">{branding.brandName}</span>
            <span>•</span>
            <span>{branding.tagline || 'The Best Partner in Laundry Service'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {allTenants.length > 1 && (
              <select
                aria-label="Pilih Mitra Laundry"
                value={branding.slug}
                onChange={(e) => {
                  const nextSlug = e.target.value;
                  loadTenantLandingData(nextSlug);
                  const url = new URL(window.location.href);
                  url.searchParams.set('tenant', nextSlug);
                  window.history.replaceState({}, '', url.toString());
                }}
                className="text-[12px] font-semibold bg-[#ffffff] border border-[#868685]/40 text-[#163300] rounded-full px-3 py-1.5"
              >
                {allTenants.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    Mitra: {t.brandName}
                  </option>
                ))}
              </select>
            )}
            <a
              href={PLATFORM_WEB_URL}
              className="text-[12px] font-semibold text-[#163300] underline hover:opacity-80"
            >
              Platform SaaS MNILab
            </a>
            <a
              href={`${PLATFORM_WEB_URL}/super-admin`}
              className="text-[12px] font-semibold text-[#163300] underline hover:opacity-80"
            >
              Super Admin SaaS
            </a>
            <p>© {currentYear} {branding.brandName}. Seluruh hak cipta dilindungi.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
