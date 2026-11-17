export interface ThemePalette {
  name: string;
  primaryColor: string;
  primaryHoverColor: string;
  darkColor: string;
  secondaryColor: string;
  surfaceColor: string;
}

export const THEME_PRESETS: ThemePalette[] = [
  {
    name: 'Bagus Lime & Forest (Default)',
    primaryColor: '#9fe870',
    primaryHoverColor: '#8ee05c',
    darkColor: '#163300',
    secondaryColor: '#054d28',
    surfaceColor: '#e2f6d5',
  },
  {
    name: 'Ocean Breeze Blue',
    primaryColor: '#7dd3fc',
    primaryHoverColor: '#38bdf8',
    darkColor: '#0c2d48',
    secondaryColor: '#145374',
    surfaceColor: '#e0f2fe',
  },
  {
    name: 'Emerald Fresh Mint',
    primaryColor: '#6ee7b7',
    primaryHoverColor: '#34d399',
    darkColor: '#06392a',
    secondaryColor: '#065f46',
    surfaceColor: '#d1fae5',
  },
  {
    name: 'Royal Lavender Purple',
    primaryColor: '#c4b5fd',
    primaryHoverColor: '#a78bfa',
    darkColor: '#2e1065',
    secondaryColor: '#4c1d95',
    surfaceColor: '#ede9fe',
  },
  {
    name: 'Sunset Warm Amber',
    primaryColor: '#fcd34d',
    primaryHoverColor: '#fbbf24',
    darkColor: '#451a03',
    secondaryColor: '#78350f',
    surfaceColor: '#fef3c7',
  },
  {
    name: 'Sakura Coral Rose',
    primaryColor: '#fda4af',
    primaryHoverColor: '#fb7185',
    darkColor: '#4c0519',
    secondaryColor: '#881337',
    surfaceColor: '#ffe4e6',
  },
  {
    name: 'Luxury Champagne Gold',
    primaryColor: '#fde047',
    primaryHoverColor: '#facc15',
    darkColor: '#1f1c14',
    secondaryColor: '#42391b',
    surfaceColor: '#fef9c3',
  },
];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
  } else if (h >= 120 && h < 180) {
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Kompres file gambar Logo (maks 256x256 WebP/PNG) sekaligus mengekstrak warna dominan
 * dari piksel logo untuk menghasilkan palet tema yang harmonis secara otomatis.
 */
export async function processLogoAndExtractTheme(
  file: File,
): Promise<{ logoDataUrl: string; palette: ThemePalette }> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file logo'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Format gambar logo tidak valid'));
    el.src = src;
  });

  const size = 240;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kanvas tidak tersedia');

  // Gambar logo di tengah kanvas persegi
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const scale = Math.min(size / img.width, size / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);

  const logoDataUrl = canvas.toDataURL('image/webp', 0.9);

  // Analisis piksel untuk menemukan hue dominan yang berwarna (bukan putih/hitam/abu)
  const imageData = ctx.getImageData(0, 0, size, size).data;
  const hueBuckets = new Array<number>(36).fill(0);
  let totalColored = 0;

  for (let i = 0; i < imageData.length; i += 16) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    if (a < 128) continue;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s >= 22 && l >= 12 && l <= 88) {
      const bucket = Math.min(35, Math.floor(h / 10));
      hueBuckets[bucket] += s;
      totalColored++;
    }
  }

  if (totalColored < 10) {
    return {
      logoDataUrl,
      palette: THEME_PRESETS[0],
    };
  }

  let bestBucket = 0;
  for (let b = 1; b < 36; b++) {
    if (hueBuckets[b] > hueBuckets[bestBucket]) {
      bestBucket = b;
    }
  }
  const dominantHue = bestBucket * 10 + 5;

  const palette: ThemePalette = {
    name: 'Tema Otomatis dari Logo',
    primaryColor: hslToHex(dominantHue, 74, 72),
    primaryHoverColor: hslToHex(dominantHue, 78, 63),
    darkColor: hslToHex(dominantHue, 75, 13),
    secondaryColor: hslToHex(dominantHue, 70, 22),
    surfaceColor: hslToHex(dominantHue, 58, 91),
  };

  return { logoDataUrl, palette };
}

