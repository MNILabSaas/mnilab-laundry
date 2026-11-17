import type { CookieOptions, Request, Response } from 'express';

export const LAUNDRY_AUTH_COOKIE = 'mnilab_laundry_token';
export const AUTH_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function parseCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() === name) {
      const raw = part.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

export function extractBearerOrCookieToken(
  req: Pick<Request, 'headers'>,
  cookieName: string,
): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const [type, token] = auth.split(' ');
    if (type === 'Bearer' && token) return token.trim();
  }
  const cookieHeader =
    typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined;
  return parseCookie(cookieHeader, cookieName) || undefined;
}

export function extractClientIp(req?: Pick<Request, 'ip' | 'socket'>): string {
  const raw = req?.ip || req?.socket?.remoteAddress || '';
  return raw.trim().replace(/^::ffff:/i, '') || 'unknown';
}

function buildCookieOptions(req: Request, maxAgeMs?: number): CookieOptions {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const isHttps =
    req.secure ||
    (typeof forwardedProto === 'string' &&
      forwardedProto.split(',')[0].trim().toLowerCase() === 'https');
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

export function setAuthCookie(
  req: Request,
  res: Response,
  name: string,
  token: string,
  maxAgeMs = AUTH_COOKIE_MAX_AGE_MS,
): void {
  res.cookie(name, token, buildCookieOptions(req, maxAgeMs));
}

export function clearAuthCookie(req: Request, res: Response, name: string): void {
  res.clearCookie(name, buildCookieOptions(req));
}
