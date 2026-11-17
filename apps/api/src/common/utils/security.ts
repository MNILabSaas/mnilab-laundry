import { createHash, timingSafeEqual } from 'node:crypto';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const DANGEROUS_XSS_PATTERN =
  /<\s*\/?\s*(?:script|iframe|object|embed|applet|meta|link|style|svg|math)\b|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|on(?:error|load|click|mouseover|focus|blur|submit|input|change|animationstart|toggle)\s*=/i;
const SAFE_IMAGE_DATA_URI_REGEX =
  /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const SAFE_HTTP_URL_REGEX = /^https?:\/\/[^\s<>"'`]+$/i;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeString(value: string): string {
  return value.replace(CONTROL_CHARS_REGEX, '');
}

export function containsDangerousXssPayload(value: string): boolean {
  return DANGEROUS_XSS_PATTERN.test(value);
}

export function escapeLikePattern(raw: string): string {
  return sanitizeString(raw).trim().replace(/[\\%_]/g, '\\$&');
}

export function toSafeLikeContain(raw: string): string {
  return `%${escapeLikePattern(raw)}%`;
}

export function hasMeaningfulSearchChars(raw: string, minAlnum = 2): boolean {
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, '');
  return alnum.length >= minAlnum;
}

export function isValidUuid(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
}

export function computePasswordVersion(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function isSafeImageUri(value: unknown, maxLength = 600_000): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  if (value.length > maxLength) return false;
  const trimmed = value.trim();
  if (containsDangerousXssPayload(trimmed)) return false;
  return SAFE_IMAGE_DATA_URI_REGEX.test(trimmed) || SAFE_HTTP_URL_REGEX.test(trimmed);
}

export function IsSafeImageUri(
  maxLength = 600_000,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeImageUri',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isSafeImageUri(value, maxLength);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} harus berupa gambar JPEG/PNG/WebP yang valid atau URL HTTPS yang aman`;
        },
      },
    });
  };
}

export function isSafeFaceDescriptor(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string' || value.length > 8000) return false;
  try {
    const parsed = JSON.parse(value) as { v?: unknown; d?: unknown };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    if (typeof parsed.v !== 'string') return false;
    if (!Array.isArray(parsed.d) || parsed.d.length !== 128) return false;
    return parsed.d.every((n) => typeof n === 'number' && Number.isFinite(n));
  } catch {
    return false;
  }
}

export function IsSafeFaceDescriptor(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeFaceDescriptor',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isSafeFaceDescriptor(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `Format ${args.property} tidak valid`;
        },
      },
    });
  };
}
