'use client';

import Link from 'next/link';
import React, { ChangeEvent, useEffect, useState } from 'react';
import {
  applyTenantThemeToDom,
  PLATFORM_WEB_URL,
  type TenantBranding,
} from '../lib/api';
import {
  processLogoAndExtractTheme,
  THEME_PRESETS,
  type ThemePalette,
} from '../lib/theme-utils';
import { MniLabLogo } from './MniLabBrand';

const DEMO_SANDBOX_STORAGE_KEY = 'mnilab_demo_sandbox_preview_v1';
const DEMO_BRANCH_MODE_STORAGE_KEY = 'mnilab_demo_branch_mode';

export type DemoBranchMode = 'WITH_BRANCHES' | 'NO_BRANCHES';

interface DemoSandboxBarProps {
  baseBranding: TenantBranding;
  activeBranding: TenantBranding;
  onPreviewChange: (nextBranding: TenantBranding) => void;
  currentArea: 'landing' | 'portal';
  onBranchModeChange?: (mode: DemoBranchMode) => void;
}

export function getStoredDemoBranchMode(): DemoBranchMode {
  if (typeof window === 'undefined') return 'WITH_BRANCHES';
  const raw = window.sessionStorage.getItem(DEMO_BRANCH_MODE_STORAGE_KEY);
  return raw === 'NO_BRANCHES' ? 'NO_BRANCHES' : 'WITH_BRANCHES';
}

export function setStoredDemoBranchMode(mode: DemoBranchMode): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(DEMO_BRANCH_MODE_STORAGE_KEY, mode);
}

export function getStoredDemoSandboxBranding(
  fallback: TenantBranding,
): TenantBranding | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(DEMO_SANDBOX_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TenantBranding>;
    return {
      ...fallback,
      ...parsed,
      slug: fallback.slug,
      isDemo: true,
    };
  } catch {
    return null;
  }
}

export function clearStoredDemoSandboxBranding(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(DEMO_SANDBOX_STORAGE_KEY);
}

export function DemoSandboxBar({
  baseBranding,
  activeBranding,
  onPreviewChange,
  currentArea,
  onBranchModeChange,
}: DemoSandboxBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [hasCustomPreview, setHasCustomPreview] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [branchMode, setBranchMode] = useState<DemoBranchMode>('WITH_BRANCHES');

  useEffect(() => {
    const savedMode = getStoredDemoBranchMode();
    setBranchMode(savedMode);
    if (onBranchModeChange) {
      onBranchModeChange(savedMode);
    }
    const saved = getStoredDemoSandboxBranding(baseBranding);
    if (saved) {
      setHasCustomPreview(true);
      onPreviewChange(saved);
      applyTenantThemeToDom(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseBranding.slug]);

  function handleToggleBranchMode() {
    const nextMode: DemoBranchMode =
      branchMode === 'WITH_BRANCHES' ? 'NO_BRANCHES' : 'WITH_BRANCHES';
    setBranchMode(nextMode);
    setStoredDemoBranchMode(nextMode);
    if (onBranchModeChange) {
      onBranchModeChange(nextMode);
    }
  }

  function savePreview(next: TenantBranding, message?: string) {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        DEMO_SANDBOX_STORAGE_KEY,
        JSON.stringify(next),
      );
    }
    setHasCustomPreview(true);
    onPreviewChange(next);
    applyTenantThemeToDom(next);
    if (message) {
      setStatusNote(message);
    }
  }

  function handlePresetSelect(preset: ThemePalette) {
    const next: TenantBranding = {
      ...activeBranding,
      primaryColor: preset.primaryColor,
      primaryHoverColor: preset.primaryHoverColor,
      darkColor: preset.darkColor,
      secondaryColor: preset.secondaryColor,
      surfaceColor: preset.surfaceColor,
    };
    savePreview(
      next,
      `Tema "${preset.name}" diterapkan pada Sandbox Preview Demo.`,
    );
  }

  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { logoDataUrl, palette } = await processLogoAndExtractTheme(file);
      const next: TenantBranding = {
        ...activeBranding,
        logoUrl: logoDataUrl,
        primaryColor: palette.primaryColor,
        primaryHoverColor: palette.primaryHoverColor,
        darkColor: palette.darkColor,
        secondaryColor: palette.secondaryColor,
        surfaceColor: palette.surfaceColor,
      };
      savePreview(
        next,
        'Logo Anda berhasil diunggah & warna tema halaman otomatis diselaraskan (Hanya di Sandbox Demo).',
      );
    } catch (err) {
      setStatusNote(
        err instanceof Error ? err.message : 'Gagal membaca file logo contoh.',
      );
    }
  }

  function handleResetPreview() {
    clearStoredDemoSandboxBranding();
    setHasCustomPreview(false);
    onPreviewChange(baseBranding);
    applyTenantThemeToDom(baseBranding);
    setStatusNote(
      'Preview logo dan tema warna berhasil dikembalikan ke kondisi awal Demo.',
    );
  }

  return (
    <div className="bg-snow text-ink border-b border-line relative z-40 no-print font-body">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/mnilab" className="flex items-center gap-2 pr-2 border-r border-line">
            <MniLabLogo size="sm" />
          </Link>
          <span className="inline-flex items-center gap-1.5 bg-scarlet text-snow text-[11px] font-sub font-semibold px-3 py-1 rounded-full tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-snow animate-pulse" />
            LINGKUNGAN DEMO (READ-ONLY)
          </span>
          <span className="text-[12px] text-muted hidden xl:inline">
            Data transaksi dikunci agar aman, namun Anda bebas mencoba simulasi Logo &amp; Tema Brand Anda.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleBranchMode}
            className={`text-[12px] font-sub font-semibold px-3.5 py-1.5 rounded-xl cursor-pointer transition-all ${
              branchMode === 'NO_BRANCHES'
                ? 'bg-scarlet hover:bg-scarlet-dark text-snow shadow-sm'
                : 'border border-line text-ink hover:bg-brand/10'
            }`}
          >
            {branchMode === 'NO_BRANCHES'
              ? '⚠ Simulasi: Belum Buat Cabang (0 Cabang / Cek Nota Terkunci)'
              : '✓ Simulasi: Sudah Buat Cabang (2 Cabang / Cek Nota Aktif)'}
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="bg-brand-dark hover:bg-ink text-snow text-[12px] font-sub font-semibold px-3.5 py-1.5 rounded-xl cursor-pointer transition-colors"
          >
            {expanded
              ? 'Tutup Simulasi Branding'
              : '✦ Coba Upload Logo & Ganti Tema Website'}
          </button>

          {hasCustomPreview && (
            <button
              type="button"
              onClick={handleResetPreview}
              className="text-[12px] font-sub font-semibold border-2 border-brand-dark text-brand-dark hover:bg-brand/10 px-3 py-1 rounded-xl cursor-pointer transition-colors"
            >
              Reset Preview
            </button>
          )}

          {currentArea === 'landing' ? (
            <Link
              href="/portal?tenant=demo-laundry"
              className="text-[12px] font-sub font-semibold border-2 border-brand-dark text-brand-dark hover:bg-brand/10 px-3.5 py-1.5 rounded-xl transition-colors"
            >
              Buka Dashboard Demo →
            </Link>
          ) : (
            <Link
              href="/?tenant=demo-laundry"
              className="text-[12px] font-sub font-semibold border-2 border-brand-dark text-brand-dark hover:bg-brand/10 px-3.5 py-1.5 rounded-xl transition-colors"
            >
              Lihat Landing Page Demo
            </Link>
          )}

          <a
            href={PLATFORM_WEB_URL}
            className="text-[12px] font-sub font-semibold text-brand-dark hover:underline underline-offset-4 px-2 py-1"
          >
            Info Paket MNILab
          </a>
        </div>
      </div>

      {/* Panel Interaktif Simulasi Branding (Khusus Sandbox Demo) */}
      {expanded && (
        <div className="border-t border-line bg-snow text-ink px-4 sm:px-6 py-5">
          <div className="max-w-[1280px] mx-auto space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="font-heading text-[20px] font-bold text-ink tracking-tight">
                  Simulasi Branding &amp; Tema Laundry Anda (Sandbox Terisolasi)
                </h3>
                <p className="text-[13px] text-muted">
                  Unggah logo laundry Anda atau pilih preset tema di bawah. Perubahan ini hanya tampil pada preview browser Anda dan tidak mengubah data produksi.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetPreview}
                  className="text-[12px] font-sub font-semibold border-2 border-brand-dark text-brand-dark hover:bg-brand/10 px-4 py-2 rounded-xl cursor-pointer"
                >
                  ↺ Reset Preview ke Kondisi Awal
                </button>
              </div>
            </div>

            {statusNote && (
              <div className="bg-white border border-brand text-ink text-[12px] font-medium px-4 py-2.5 rounded-xl flex items-center justify-between shadow-xs">
                <span>✦ {statusNote}</span>
                <button
                  type="button"
                  onClick={() => setStatusNote(null)}
                  className="text-brand-dark font-bold ml-3 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center border border-line bg-white rounded-2xl p-5 shadow-sm">
              {/* Upload Logo & Nama Brand Simulasi */}
              <div className="lg:col-span-5 flex flex-col sm:flex-row items-start sm:items-center gap-3.5 border-b lg:border-b-0 lg:border-r border-line pb-4 lg:pb-0 lg:pr-4">
                <img
                  src={activeBranding.logoUrl || '/Assets/logoDemoLaundry.webp'}
                  alt="Preview Logo"
                  className="w-14 h-14 rounded-full object-cover border border-line bg-white shrink-0"
                />
                <div className="space-y-2 flex-1 w-full">
                  <div>
                    <label className="block text-[11px] font-sub font-semibold uppercase tracking-wider text-ink mb-1">
                      1. Nama Brand Laundry Simulasi
                    </label>
                    <input
                      type="text"
                      value={activeBranding.brandName}
                      onChange={(e) =>
                        savePreview({
                          ...activeBranding,
                          brandName: e.target.value || 'Laundry Anda',
                        })
                      }
                      placeholder="Ketik nama laundry Anda..."
                      className="w-full bg-snow border border-line rounded-xl px-3 py-1.5 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-sub font-semibold uppercase tracking-wider text-ink mb-1">
                      2. Upload Logo Anda (Ekstrak Warna Otomatis)
                    </label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLogoUpload}
                      className="text-[11px] text-muted file:mr-2.5 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-[11px] file:font-sub file:font-semibold file:bg-brand-dark file:text-snow file:cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Pilihan Preset Tema */}
              <div className="lg:col-span-7 space-y-2">
                <div className="text-[11px] font-sub font-semibold uppercase tracking-wider text-ink">
                  3. Pilih Tema Warna Website yang Tersedia:
                </div>
                <div className="flex flex-wrap gap-2">
                  {THEME_PRESETS.map((preset) => {
                    const isSelected =
                      activeBranding.primaryColor.toLowerCase() ===
                        preset.primaryColor.toLowerCase() &&
                      activeBranding.darkColor.toLowerCase() ===
                        preset.darkColor.toLowerCase();
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handlePresetSelect(preset)}
                        className={`text-[11px] font-sub font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 cursor-pointer transition-all border border-black/10 ${
                          isSelected
                            ? 'ring-2 ring-brand scale-[1.02]'
                            : 'opacity-90 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: preset.surfaceColor,
                          color: preset.darkColor,
                        }}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-black/20"
                          style={{ backgroundColor: preset.primaryColor }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-black/20"
                          style={{ backgroundColor: preset.darkColor }}
                        />
                        <span>{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

