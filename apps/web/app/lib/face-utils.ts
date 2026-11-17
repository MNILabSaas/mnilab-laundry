/**
 * Utilitas Foto Profil, Face Recognition (face-api / FaceNet 128-D), & Geolocation (Haversine).
 *
 * Model disajikan dari /public/models (disalin dari node_modules/@vladmandic/face-api/model).
 */

type FaceApi = typeof import('@vladmandic/face-api');

const MODEL_URL = '/models';
/** Versi format descriptor yang disimpan di DB. Descriptor lama (non face-api) diabaikan. */
const DESCRIPTOR_VERSION = 'faceapi-v1';

/**
 * Jarak Euclidean maksimum agar dua wajah dianggap orang yang sama.
 * Wajah orang yang sama umumnya berada di rentang 0.22 - 0.48, sedangkan orang berbeda > 0.55.
 */
export const FACE_MATCH_MAX_DISTANCE = 0.5;
/** Selisih minimal jarak kandidat terbaik vs kedua agar hasil tidak ambigu. */
export const FACE_MATCH_MIN_MARGIN = 0.04;

/** Hitung jarak GPS dalam meter menggunakan rumus Haversine */
export function calculateGpsDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

let faceApiPromise: Promise<FaceApi> | null = null;

/** Muat library + model face-api sekali saja (lazy, hanya di browser). */
export function loadFaceModels(): Promise<FaceApi> {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const tfRuntime = faceapi.tf as unknown as {
        setBackend?: (backend: string) => Promise<boolean>;
        ready?: () => Promise<void>;
      };
      try {
        await tfRuntime.setBackend?.('webgl');
      } catch {
        // fallback otomatis ke backend lain
      }
      await tfRuntime.ready?.();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((err) => {
      faceApiPromise = null;
      throw err;
    });
  }
  return faceApiPromise;
}

type FaceInput = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

/**
 * Deteksi wajah dan hasilkan descriptor 128-D menggunakan SSD MobileNetV1
 * (konsisten antara foto referensi dan kamera live agar landmark & embedding akurat),
 * dengan fallback TinyFaceDetector bila diperlukan.
 */
export async function detectFaceDescriptor(
  input: FaceInput,
): Promise<{
  descriptor: number[];
  faceCount: number;
  box: { x: number; y: number; width: number; height: number };
} | null> {
  const faceapi = await loadFaceModels();

  let results = await faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (results.length === 0) {
    results = await faceapi
      .detectAllFaces(
        input,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.55 }),
      )
      .withFaceLandmarks()
      .withFaceDescriptors();
  }

  if (results.length === 0) return null;
  // Ambil wajah terbesar (paling dekat ke kamera)
  const main = results.reduce((a, b) =>
    a.detection.box.area >= b.detection.box.area ? a : b,
  );
  const b = main.detection.box;
  return {
    descriptor: Array.from(main.descriptor),
    faceCount: results.length,
    box: { x: b.x, y: b.y, width: b.width, height: b.height },
  };
}

/** Jarak Euclidean antar descriptor (0 = identik). */
export function faceDistance(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Konversi jarak Euclidean FaceNet ke persentase kecocokan yang akurat:
 * - Jarak <= 0.20 -> ~99%
 * - Jarak 0.35 (wajah sama, beda ekspresi/cahaya) -> ~93%
 * - Jarak 0.50 (batas maksimum wajah sama) -> ~82%
 * - Jarak > 0.50 (wajah berbeda) -> turun tajam di bawah 70%
 */
export function distanceToMatchPercent(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  if (distance <= 0.2) return 99.5;
  if (distance <= FACE_MATCH_MAX_DISTANCE) {
    const ratio = (distance - 0.2) / (FACE_MATCH_MAX_DISTANCE - 0.2);
    const pct = 99.5 - ratio * 17.5; // 99.5% .. 82.0%
    return Math.round(pct * 10) / 10;
  }
  const overRatio = Math.min(1, (distance - FACE_MATCH_MAX_DISTANCE) / 0.35);
  const pct = Math.max(0, 68 * (1 - overRatio));
  return Math.round(pct * 10) / 10;
}

export function serializeFaceDescriptor(descriptor: number[]): string {
  return JSON.stringify({
    v: DESCRIPTOR_VERSION,
    d: descriptor.map((n) => Math.round(n * 1e6) / 1e6),
  });
}

/** Parse descriptor tersimpan. Format lama (bukan face-api) dianggap tidak valid. */
export function parseStoredFaceDescriptor(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as { v?: string }).v === DESCRIPTOR_VERSION
    ) {
      const d = (parsed as { d?: unknown }).d;
      if (Array.isArray(d) && d.length === 128) return d as number[];
    }
  } catch {
    // abaikan
  }
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Format gambar tidak valid'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/**
 * Kompresi gambar menjadi DataURL persegi (maks 320x320) dan ekstrak faceDescriptor 128-D.
 * Bila wajah terdeteksi pada gambar asli, area crop dipusatkan pada wajah tersebut.
 */
export async function processImageFileToAvatar(
  file: File,
  maxSize = 320,
): Promise<{ dataUrl: string; faceDescriptor: string | null; faceCount: number }> {
  const src = await readFileAsDataUrl(file);
  const img = await loadImage(src);

  let initialDetection: Awaited<ReturnType<typeof detectFaceDescriptor>> = null;
  try {
    initialDetection = await detectFaceDescriptor(img);
  } catch {
    // lanjutkan ke crop standar
  }

  const canvas = document.createElement('canvas');
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Gagal menginisialisasi kanvas gambar');

  if (initialDetection) {
    // Pusatkan crop persegi di sekitar wajah yang terdeteksi
    const { box } = initialDetection;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const side = Math.min(
      Math.min(img.width, img.height),
      Math.max(box.width, box.height) * 2.2,
    );
    const sx = Math.max(0, Math.min(img.width - side, cx - side / 2));
    const sy = Math.max(0, Math.min(img.height - side, cy - side / 2));
    ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
  } else {
    const minSide = Math.min(img.width, img.height);
    const sx = (img.width - minSide) / 2;
    const sy = (img.height - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, maxSize, maxSize);
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

  let faceDescriptor: string | null = null;
  let faceCount = 0;
  try {
    const canvasDetection = await detectFaceDescriptor(canvas);
    const chosen = canvasDetection ?? initialDetection;
    if (chosen) {
      faceDescriptor = serializeFaceDescriptor(chosen.descriptor);
      faceCount = chosen.faceCount;
    }
  } catch {
    if (initialDetection) {
      faceDescriptor = serializeFaceDescriptor(initialDetection.descriptor);
      faceCount = initialDetection.faceCount;
    }
  }
  return { dataUrl, faceDescriptor, faceCount };
}

/** Ekstrak descriptor dari avatar tersimpan (untuk data lama tanpa descriptor face-api). */
export async function extractDescriptorFromDataUrl(dataUrl: string): Promise<number[] | null> {
  try {
    const img = await loadImage(dataUrl);
    const result = await detectFaceDescriptor(img);
    return result?.descriptor ?? null;
  } catch {
    return null;
  }
}

/** Ambil snapshot JPEG persegi dari video kamera sebagai bukti absen. */
export function captureVideoSnapshot(video: HTMLVideoElement, maxSize = 320): string {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const minSide = Math.min(vw, vh);
  const canvas = document.createElement('canvas');
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(
    video,
    (vw - minSide) / 2,
    (vh - minSide) / 2,
    minSide,
    minSide,
    0,
    0,
    maxSize,
    maxSize,
  );
  return canvas.toDataURL('image/jpeg', 0.82);
}

export type FaceMatchResult =
  | { status: 'NO_FACE' }
  | { status: 'MULTIPLE_FACES' }
  | { status: 'UNKNOWN'; bestDistance: number; bestPercent: number }
  | { status: 'MATCH'; employeeId: string; distance: number; percent: number };

/** Cocokkan wajah di frame video dengan daftar descriptor pegawai cabang. */
export async function matchFaceFromVideo(
  video: HTMLVideoElement,
  references: Record<string, number[]>,
): Promise<FaceMatchResult> {
  const result = await detectFaceDescriptor(video);
  if (!result) return { status: 'NO_FACE' };
  if (result.faceCount > 1) return { status: 'MULTIPLE_FACES' };

  let bestId = '';
  let best = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;
  for (const [id, ref] of Object.entries(references)) {
    const d = faceDistance(result.descriptor, ref);
    if (d < best) {
      second = best;
      best = d;
      bestId = id;
    } else if (d < second) {
      second = d;
    }
  }

  if (
    !bestId ||
    best > FACE_MATCH_MAX_DISTANCE ||
    (Number.isFinite(second) && second - best < FACE_MATCH_MIN_MARGIN)
  ) {
    return {
      status: 'UNKNOWN',
      bestDistance: best,
      bestPercent: distanceToMatchPercent(best),
    };
  }
  return {
    status: 'MATCH',
    employeeId: bestId,
    distance: best,
    percent: distanceToMatchPercent(best),
  };
}
