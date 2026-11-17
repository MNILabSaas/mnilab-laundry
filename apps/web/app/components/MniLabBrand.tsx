'use client';

import React from 'react';

export interface TmiLabLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export type MniLabLogoProps = TmiLabLogoProps;

const SIZE_CLASSES: Record<NonNullable<TmiLabLogoProps['size']>, string> = {
  sm: 'h-8 sm:h-9',
  md: 'h-10 sm:h-12',
  lg: 'h-14 sm:h-16',
  xl: 'h-20 sm:h-24',
};

/**
 * Logo Resmi SaaS TMILab (TMILab DIGITAL PRODUCT SYSTEM).
 * Proporsi asli dipertahankan 100% tanpa distorsi.
 */
export function TmiLabLogo({ className = '', size = 'md' }: TmiLabLogoProps) {
  return (
    <img
      src="/Assets/LogoSaas-crop.png"
      onError={(e) => {
        const target = e.currentTarget;
        if (!target.src.endsWith('/Assets/LogoSaas.png')) {
          target.src = '/Assets/LogoSaas.png';
        }
      }}
      alt="TMILab — Digital Product System"
      className={`w-auto object-contain select-none ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}

export const MniLabLogo = TmiLabLogo;

export interface TmiLabLuxuryLoaderProps {
  label?: string;
  subtitle?: string;
  fullScreen?: boolean;
  overlay?: boolean;
}

export type MniLabLuxuryLoaderProps = TmiLabLuxuryLoaderProps;

/**
 * Komponen Loading SaaS TMILab:
 * Menampilkan simbol Monogram Emas resmi (/Assets/loadingSaas-crop.png)
 * dengan tulisan "LOADING" beraksen Gilded & Obsidian sesuai DESIGN.md.
 */
export function TmiLabLuxuryLoader({
  label = 'LOADING',
  subtitle = 'TMILab Digital Product System',
  fullScreen = true,
  overlay = false,
}: TmiLabLuxuryLoaderProps) {
  const wrapperClass = overlay
    ? 'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#08080a]/92 backdrop-blur-md px-6'
    : fullScreen
      ? 'min-h-screen w-full flex flex-col items-center justify-center bg-[#08080a] text-[#e2e3e9] px-6'
      : 'w-full py-16 flex flex-col items-center justify-center bg-[#08080a] text-[#e2e3e9] rounded-[10px] border border-[#1c1d22] px-6';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={wrapperClass}
    >
      <div className="relative flex flex-col items-center max-w-md w-full text-center">
        {/* Emblem Frame with Gold Monogram Symbol */}
        <div className="relative flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44 mb-5">
          {/* Outer Subtle Ring */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-[#1c1d22]"
          />
          {/* Rotating Subtle Accent Arc */}
          <div
            aria-hidden="true"
            className="absolute inset-1.5 rounded-full border-2 border-transparent border-t-[#cc9166] border-r-[#cc9166]/40 animate-spin"
            style={{ animationDuration: '2.4s' }}
          />
          {/* Inner Onyx Pedestal */}
          <div
            aria-hidden="true"
            className="absolute inset-4 rounded-full bg-[#040406] border border-[#2e3038] shadow-[0_0_30px_rgba(0,0,0,0.8)]"
          />

          {/* Official Loading Symbol */}
          <img
            src="/Assets/loadingSaas-crop.png"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.endsWith('/Assets/loadingSaas.png')) {
                target.src = '/Assets/loadingSaas.png';
              }
            }}
            alt="TMILab Loading Symbol"
            className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 object-contain select-none animate-mnilab-logo"
          />
        </div>

        {/* Tulisan LOADING dengan tipografi Didone Serif Slash */}
        <div className="space-y-2 relative z-10">
          <div className="font-ivy font-normal text-[22px] sm:text-[26px] tracking-[0.38em] uppercase slash-gilded-text pl-[0.38em]">
            {label}
          </div>

          {subtitle && (
            <p className="text-[12px] sm:text-[13px] font-medium tracking-[0.16em] uppercase text-[#9194a1]">
              {subtitle}
            </p>
          )}
        </div>

        {/* Gilded Shimmer Progress Line */}
        <div className="mt-6 w-48 sm:w-56 h-[2px] rounded-full bg-[#1c1d22] overflow-hidden relative">
          <div
            className="w-1/2 h-full rounded-full animate-mnilab-bar"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, #cc9166 40%, #ffffff 70%, transparent 100%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export const MniLabLuxuryLoader = TmiLabLuxuryLoader;

