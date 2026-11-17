type FaceApi = typeof import('@vladmandic/face-api');

const MODEL_URL = '/models';
const DESCRIPTOR_VERSION = 'faceapi-v1';
export const FACE_MATCH_MAX_DISTANCE = 0.5;

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

export function loadFaceModels(): Promise<FaceApi> {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const tfRuntime = faceapi.tf as unknown as {
        setBackend?: (b: string) => Promise<boolean>;
        ready?: () => Promise<void>;
      };
      try {
        await tfRuntime.setBackend?.('webgl');
      } catch {
        // fallback automatically
      }
      await tfRuntime.ready?.();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })();
  }
  return faceApiPromise;
}

export async function extractFaceDescriptorFromVideo(
  video: HTMLVideoElement,
): Promise<number[] | null> {
  const faceapi = await loadFaceModels();
  const det = await faceapi
    .detectSingleFace(video)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) return null;
  return Array.from(det.descriptor);
}

export function serializeFaceDescriptor(vec: number[]): string {
  return JSON.stringify({ v: DESCRIPTOR_VERSION, d: vec });
}

export function parseFaceDescriptor(raw?: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: string; d?: number[] };
    if (
      parsed?.v === DESCRIPTOR_VERSION &&
      Array.isArray(parsed.d) &&
      parsed.d.length === 128
    ) {
      return parsed.d;
    }
    return null;
  } catch {
    return null;
  }
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
