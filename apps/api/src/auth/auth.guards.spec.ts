import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { UserRole } from '../common/enums.js';
import { runWithTenantContext } from '../tenant-context/tenant-context.js';
import { DEFAULT_LAUNDRY_THEME } from '../tenant-context/tenant-profile.entity.js';
import {
  EntitlementAndDemoGuard,
  LaundryJwtAuthGuard,
  RolesGuard,
} from './auth.guards.js';

function makeContext(opts: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  user?: any;
}) {
  const req: any = {
    method: opts.method ?? 'GET',
    originalUrl: opts.url ?? '/orders',
    headers: opts.headers ?? {},
    user: opts.user,
  };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;
}

describe('Laundry Auth, Tenant Isolation, & Entitlement Guards', () => {
  it('LaundryJwtAuthGuard menolak token lintas tenant', async () => {
    const jwt = new JwtService({ secret: 'secret-test-min-32-characters-123456' });
    const token = await jwt.signAsync({
      sub: 'staff-1',
      platformUserId: 'pu-1',
      tenantId: 'tenant-A',
      tenantSlug: 'toko-a',
      aud: 'mnilab-laundry',
    });

    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const guard = new LaundryJwtAuthGuard(reflector, jwt, {
      findOne: async () => null,
    } as never);

    await runWithTenantContext(
      {
        tenantId: 'tenant-B',
        tenantSlug: 'toko-b',
        brandName: 'Toko B',
        tagline: 'T',
        logoUrl: null,
        theme: DEFAULT_LAUNDRY_THEME,
        whatsappPhone: null,
        isDemo: false,
        entitlement: {
          tenantId: 'tenant-B',
          tenantSlug: 'toko-b',
          productCode: 'LAUNDRY',
          allowed: true,
          status: 'ACTIVE',
          isDemo: false,
          reason: null,
          limits: { maxBranches: 3 },
          features: [],
          subscriptionEndAt: null,
        },
      },
      async () => {
        await expect(
          guard.canActivate(
            makeContext({ headers: { authorization: `Bearer ${token}` } }),
          ),
        ).rejects.toThrow(/tidak cocok dengan tenant aktif/i);
      },
    );
  });

  it('EntitlementAndDemoGuard memblokir akses saat langganan EXPIRED dan memblokir mutasi pada DEMO', () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const guard = new EntitlementAndDemoGuard(reflector);

    runWithTenantContext(
      {
        tenantId: 't1',
        tenantSlug: 'toko-expired',
        brandName: 'Expired',
        tagline: 'T',
        logoUrl: null,
        theme: DEFAULT_LAUNDRY_THEME,
        whatsappPhone: null,
        isDemo: false,
        entitlement: {
          tenantId: 't1',
          tenantSlug: 'toko-expired',
          productCode: 'LAUNDRY',
          allowed: false,
          status: 'EXPIRED',
          isDemo: false,
          reason: 'Langganan berakhir',
          limits: { maxBranches: 1 },
          features: [],
          subscriptionEndAt: null,
        },
      },
      () => {
        expect(() => guard.canActivate(makeContext({ method: 'GET' }))).toThrow(
          /Langganan berakhir/i,
        );
      },
    );

    runWithTenantContext(
      {
        tenantId: 'demo',
        tenantSlug: 'demo-laundry',
        brandName: 'Demo',
        tagline: 'T',
        logoUrl: null,
        theme: DEFAULT_LAUNDRY_THEME,
        whatsappPhone: null,
        isDemo: true,
        entitlement: {
          tenantId: 'demo',
          tenantSlug: 'demo-laundry',
          productCode: 'LAUNDRY',
          allowed: true,
          status: 'ACTIVE',
          isDemo: true,
          reason: null,
          limits: { maxBranches: 3 },
          features: [],
          subscriptionEndAt: null,
        },
      },
      () => {
        expect(guard.canActivate(makeContext({ method: 'GET' }))).toBe(true);
        expect(() => guard.canActivate(makeContext({ method: 'POST' }))).toThrow(
          /Read-Only/i,
        );
      },
    );
  });

  it('RolesGuard membatasi akses berdasarkan role operasional Laundry', () => {
    const reflector = {
      getAllAndOverride: () => [UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() =>
      guard.canActivate(makeContext({ user: { role: UserRole.CASHIER } })),
    ).toThrow(/tidak memiliki izin/i);

    expect(
      guard.canActivate(makeContext({ user: { role: UserRole.SUPER_OWNER } })),
    ).toBe(true);
  });
});
