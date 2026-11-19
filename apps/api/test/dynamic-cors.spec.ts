import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AllowedOriginService } from '../src/common/security/allowed-origin.service.js';
import { TenantContextMiddleware } from '../src/tenant-context/tenant-context.middleware.js';
import type { TenantProfile } from '../src/tenant-context/tenant-profile.entity.js';

function createMockProfilesRepo(initialProfiles: Partial<TenantProfile>[]) {
  const store = new Map<string, Partial<TenantProfile>>();
  for (const p of initialProfiles) {
    if (p.customDomain) {
      store.set(p.customDomain.toLowerCase(), { ...p });
    }
  }
  return {
    store,
    findOne: vi.fn(async ({ where }: { where: { customDomain?: string } }) => {
      const key = where?.customDomain?.toLowerCase();
      return key ? (store.get(key) as TenantProfile) ?? null : null;
    }),
    upsert: vi.fn(async (entity: Partial<TenantProfile>) => {
      if (entity.customDomain) {
        store.set(entity.customDomain.toLowerCase(), { ...entity });
      }
    }),
  };
}

describe('Dynamic CORS & Cross-Tenant Origin Protection (Laundry API)', () => {
  it('mengizinkan origin custom domain yang verified + active dan menolak yang unverified / inactive', async () => {
    const repo = createMockProfilesRepo([
      {
        tenantId: 't-active',
        slug: 'berkahlaundry',
        customDomain: 'berkahlaundry.com',
        customDomainVerified: true,
        subscriptionStatus: 'ACTIVE',
      },
      {
        tenantId: 't-unverified',
        slug: 'unverifiedlaundry',
        customDomain: 'unverifiedlaundry.com',
        customDomainVerified: false,
        subscriptionStatus: 'ACTIVE',
      },
      {
        tenantId: 't-expired',
        slug: 'expiredlaundry',
        customDomain: 'expiredlaundry.com',
        customDomainVerified: true,
        subscriptionStatus: 'EXPIRED',
      },
    ]);
    const platformClient = {
      resolveTenantBySlug: vi.fn(async () => {
        throw new Error('Not found');
      }),
    };
    const service = new AllowedOriginService(repo as any, platformClient as any);

    const ok = await service.validateOrigin('https://berkahlaundry.com');
    expect(ok.allowed).toBe(true);
    expect(ok.reason).toBe('CUSTOM_DOMAIN_VERIFIED_ACTIVE');
    expect(ok.normalizedOrigin).toBe('https://berkahlaundry.com');

    const unverified = await service.validateOrigin('https://unverifiedlaundry.com');
    expect(unverified.allowed).toBe(false);
    expect(unverified.reason).toBe('DOMAIN_NOT_VERIFIED');

    const expired = await service.validateOrigin('https://expiredlaundry.com');
    expect(expired.allowed).toBe(false);
    expect(expired.reason).toBe('TENANT_INACTIVE');
  });

  it('mencegah domain Tenant A dipakai mengakses konteks Tenant B dengan mengganti Origin / X-Tenant-Slug', async () => {
    const repo = createMockProfilesRepo([
      {
        tenantId: 't-a',
        slug: 'tenant-a',
        customDomain: 'tenanta.com',
        customDomainVerified: true,
        subscriptionStatus: 'ACTIVE',
      },
      {
        tenantId: 't-b',
        slug: 'tenant-b',
        customDomain: 'tenantb.com',
        customDomainVerified: true,
        subscriptionStatus: 'ACTIVE',
      },
    ]);
    const platformClient = {
      resolveTenantBySlug: vi.fn(async (slug: string) => {
        if (slug === 'tenant-b') {
          return {
            tenant: {
              id: 't-b',
              slug: 'tenant-b',
              customDomain: 'tenantb.com',
              customDomainVerified: true,
              brandName: 'Tenant B',
              tagline: 'Tagline B',
              logoUrl: null,
              theme: {},
              whatsappPhone: null,
              isDemo: false,
            },
            entitlement: {
              tenantId: 't-b',
              tenantSlug: 'tenant-b',
              productCode: 'LAUNDRY',
              allowed: true,
              status: 'ACTIVE',
              isDemo: false,
              reason: null,
              limits: { maxBranches: 3 },
              features: [],
              subscriptionEndAt: null,
            },
          };
        }
        throw new Error('Not found');
      }),
    };
    const allowedOriginService = new AllowedOriginService(
      repo as any,
      platformClient as any,
    );
    const jwtService = { verifyAsync: vi.fn() };
    const middleware = new TenantContextMiddleware(
      platformClient as any,
      jwtService as any,
      repo as any,
      undefined,
      allowedOriginService,
    );

    const fakeReq: any = {
      originalUrl: '/orders',
      headers: {
        origin: 'https://tenanta.com',
        'x-tenant-slug': 'tenant-b',
        host: 'laundry.mnilab.my.id',
      },
      query: {},
    };
    const next = vi.fn();

    await expect(middleware.use(fakeReq, {} as any, next)).rejects.toThrow(
      ForbiddenException,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('menolak origin palsu, scheme HTTP pada custom domain, dan fail-closed saat DB error', async () => {
    const repo = {
      findOne: vi.fn(async () => {
        throw new Error('DB Down');
      }),
    };
    const platformClient = { resolveTenantBySlug: vi.fn() };
    const service = new AllowedOriginService(repo as any, platformClient as any);

    const httpAttempt = await service.validateOrigin('http://tenanta.com');
    expect(httpAttempt.allowed).toBe(false);
    expect(httpAttempt.reason).toBe('INSECURE_PROTOCOL_OR_PORT');

    const portAttempt = await service.validateOrigin('https://tenanta.com:3002');
    expect(portAttempt.allowed).toBe(false);
    expect(portAttempt.reason).toBe('INSECURE_PROTOCOL_OR_PORT');

    const dbFail = await service.validateOrigin('https://tenanta.com');
    expect(dbFail.allowed).toBe(false);
    expect(dbFail.reason).toBe('LOOKUP_ERROR');
  });
});
