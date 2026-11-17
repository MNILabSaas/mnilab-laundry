'use client';

import { useState } from 'react';
import {
  applyTenantThemeToDom,
  type TenantBrandingInfo,
  type TenantThemeConfig,
} from '../lib/laundry-api';

const PRESETS: Array<{ name: string; theme: TenantThemeConfig }> = [
  {
    name: 'Hijau MNILab',
    theme: {
      primaryColor: '#9fe870',
      primaryHoverColor: '#8ee05c',
      darkColor: '#163300',
      secondaryColor: '#054d28',
      surfaceColor: '#e2f6d5',
    },
  },
  {
    name: 'Biru Laut',
    theme: {
      primaryColor: '#38bdf8',
      primaryHoverColor: '#0ea5e9',
      darkColor: '#0c4a6e',
      secondaryColor: '#0369a1',
      surfaceColor: '#e0f2fe',
    },
  },
  {
    name: 'Ungu Elegan',
    theme: {
      primaryColor: '#c084fc',
      primaryHoverColor: '#a855f7',
      darkColor: '#3b0764',
      secondaryColor: '#6b21a8',
      surfaceColor: '#f3e8ff',
    },
  },
];

export function DemoSandboxBar({
  branding,
  onPreviewChange,
}: {
  branding: TenantBrandingInfo;
  onPreviewChange: (next: TenantBrandingInfo) => void;
}) {
  const [brandInput, setBrandInput] = useState(branding.brandName);
  const [expanded, setExpanded] = useState(false);

  if (!branding.isDemo) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-2.5 text-xs">
        <span>
          <strong>Mode Demo (Read-Only):</strong> Data transaksi dikunci, tetapi
          Anda bisa mencoba simulasi white-label branding.
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg bg-amber-900 px-3 py-1 font-medium text-white"
        >
          {expanded ? 'Tutup Simulasi' : 'Simulasi Branding'}
        </button>
      </div>
      {expanded && (
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 border-t border-amber-200 px-6 py-3 text-xs">
          <input
            value={brandInput}
            onChange={(e) => {
              const val = e.target.value;
              setBrandInput(val);
              onPreviewChange({ ...branding, brandName: val || branding.brandName });
            }}
            placeholder="Nama Brand Simulasi"
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5"
          />
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                applyTenantThemeToDom(p.theme);
                onPreviewChange({ ...branding, theme: p.theme });
              }}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 hover:bg-amber-100"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
