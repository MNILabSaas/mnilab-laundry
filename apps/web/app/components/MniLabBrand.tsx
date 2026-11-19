'use client';

import React from 'react';

export interface TmiLabLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export type MniLabLogoProps = TmiLabLogoProps;

const SIZE_CLASSES: Record<NonNullable<TmiLabLogoProps['size']>, string> = {
  sm: 'h-11 sm:h-12',
  md: 'h-14 sm:h-16',
  lg: 'h-20 sm:h-24',
  xl: 'h-28 sm:h-32',
};

export function TmiLabLogo({ className = '', size = 'md' }: TmiLabLogoProps) {
  return (
    <img
      src="/assets/newLogo/MNILogoNoBackground.webp"
      onError={(e) => {
        const target = e.currentTarget;
        if (!target.src.endsWith('/assets/LogoSaas-crop.png')) {
          target.src = '/assets/LogoSaas-crop.png';
        }
      }}
      alt="MNILab — Digital Product System"
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

export function TmiLabLuxuryLoader({
  label = 'LOADING',
  subtitle = 'MNILab Digital Product System',
  fullScreen = true,
  overlay = false,
}: TmiLabLuxuryLoaderProps) {
  const wrapperClass = overlay
    ? 'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-snow/95 backdrop-blur-md px-6'
    : fullScreen
      ? 'min-h-screen w-full flex flex-col items-center justify-center bg-snow text-ink px-6'
      : 'w-full py-16 flex flex-col items-center justify-center bg-snow text-ink rounded-2xl border border-line px-6';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={wrapperClass}
    >
      <div className="relative flex flex-col items-center max-w-md w-full text-center">
        <div className="relative flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44 mb-5">
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-line"
          />
          <div
            aria-hidden="true"
            className="absolute inset-1.5 rounded-full border-2 border-transparent border-t-brand-dark border-r-brand animate-spin"
            style={{ animationDuration: '2.2s' }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-4 rounded-full bg-white border border-line shadow-sm"
          />

          <img
            src="/assets/newLogo/logoOnlyNoBackground.webp"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.endsWith('/assets/loadingSaas-crop.png')) {
                target.src = '/assets/loadingSaas-crop.png';
              }
            }}
            alt="MNILab Loading Symbol"
            className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 object-contain select-none animate-mnilab-logo"
          />
        </div>

        <div className="space-y-2 relative z-10">
          <div className="font-heading font-extrabold text-[22px] sm:text-[26px] tracking-[0.34em] uppercase text-ink pl-[0.34em]">
            {label}
          </div>

          {subtitle && (
            <p className="font-sub font-semibold text-[12px] sm:text-[13px] tracking-[0.14em] uppercase text-brand-dark">
              {subtitle}
            </p>
          )}
        </div>

        <div className="mt-6 w-48 sm:w-56 h-[3px] rounded-full bg-line overflow-hidden relative">
          <div
            className="w-1/2 h-full rounded-full animate-mnilab-bar"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, #1F7AB0 45%, #2C99D6 75%, transparent 100%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export const MniLabLuxuryLoader = TmiLabLuxuryLoader;
