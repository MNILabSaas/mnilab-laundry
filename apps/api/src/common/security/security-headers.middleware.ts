import { BadRequestException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  containsDangerousXssPayload,
  sanitizeString,
} from '../utils/security.js';

const PASSWORD_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
]);

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizeAndInspectPayload(
  value: unknown,
  keyName = '',
  depth = 0,
): unknown {
  if (depth > 10) {
    throw new BadRequestException('Struktur data request terlalu dalam');
  }
  if (typeof value === 'string') {
    const cleaned = sanitizeString(value);
    if (!PASSWORD_KEYS.has(keyName) && containsDangerousXssPayload(cleaned)) {
      throw new BadRequestException(
        'Input mengandung skrip atau atribut HTML berbahaya yang tidak diizinkan',
      );
    }
    return cleaned;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAndInspectPayload(item, keyName, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (FORBIDDEN_OBJECT_KEYS.has(k)) {
        try {
          delete obj[k];
        } catch {
          // ignore non-configurable
        }
        continue;
      }
      const nextVal = sanitizeAndInspectPayload(obj[k], k, depth + 1);
      try {
        obj[k] = nextVal;
      } catch {
        // ignore read-only getter
      }
    }
    return obj;
  }
  return value;
}

export function securityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), geolocation=(self), microphone=(), payment=()',
  );
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );

  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  if (req.headers.authorization || req.method !== 'GET') {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    res.setHeader('Pragma', 'no-cache');
  }

  if (req.body && typeof req.body === 'object') {
    sanitizeAndInspectPayload(req.body);
  }
  if (req.params && typeof req.params === 'object') {
    sanitizeAndInspectPayload(req.params);
  }
  if (req.query && typeof req.query === 'object') {
    sanitizeAndInspectPayload(req.query);
  }

  next();
}
