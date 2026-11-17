import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { UserRole } from '../common/enums.js';
import { DEFAULT_LAUNDRY_THEME } from '../tenant-context/tenant-profile.entity.js';
import { AuthService } from './auth.service.js';

describe('Laundry AuthService (SSO Exchange & Staff Sync)', () => {
  it('exchangeSsoLaunchToken membuat SUPER_OWNER otomatis untuk TENANT_OWNER baru', async () => {
    const jwt = new JwtService({ secret: 'secret-test-min-32-characters-123456' });
    let savedStaff: any = null;

    const platformClient = {
      exchangeLaunchToken: async () => ({
        user: {
          id: 'pu-1',
          name: 'Pemilik Toko',
          email: 'owner@toko.id',
          phone: null,
          platformRole: 'USER',
        },
        tenant: {
          id: 'tenant-1',
          slug: 'bersih-jaya',
          brandName: 'Bersih Jaya',
          tagline: 'Rapi',
          logoUrl: null,
          theme: DEFAULT_LAUNDRY_THEME,
          cityOrRegion: null,
          defaultAddress: null,
          whatsappPhone: null,
          status: 'ACTIVE',
          isDemo: false,
          isActive: true,
        },
        membership: { id: 'm-1', role: 'TENANT_OWNER' as const },
        entitlement: {
          tenantId: 'tenant-1',
          tenantSlug: 'bersih-jaya',
          productCode: 'LAUNDRY',
          allowed: true,
          status: 'ACTIVE',
          isDemo: false,
          reason: null,
          limits: { maxBranches: 3 },
          features: [],
          subscriptionEndAt: null,
        },
      }),
    };

    const staffRepo = {
      findOne: async () => null,
      create: (data: any) => ({ id: 'staff-1', ...data }),
      save: async (entity: any) => {
        savedStaff = entity;
        return entity;
      },
    };
    const profilesRepo = { upsert: async () => ({}) };

    const service = new AuthService(
      platformClient as never,
      jwt,
      staffRepo as never,
      profilesRepo as never,
    );

    const res = await service.exchangeSsoLaunchToken('launch-code-123456');
    expect(savedStaff.role).toBe(UserRole.SUPER_OWNER);
    expect(savedStaff.branchId).toBeNull();
    expect(res.user.role).toBe(UserRole.SUPER_OWNER);
    expect(res.accessToken).toBeTruthy();
  });
});
