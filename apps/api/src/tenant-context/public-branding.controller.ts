import { Controller, Get, Optional, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../common/auth/auth.decorators.js';
import { PlatformClientService } from '../platform/platform-client.service.js';
import { DemoSeedService } from './demo-seed.service.js';
import {
  type ActiveTenantContext,
  getActiveTenantContext,
} from './tenant-context.js';
import {
  DEFAULT_LAUNDRY_THEME,
  TenantProfile,
} from './tenant-profile.entity.js';

export function formatTenantBrandingForClient(
  ctx: ActiveTenantContext,
  extra?: {
    cityOrRegion?: string | null;
    defaultAddress?: string | null;
    isDefault?: boolean;
  },
) {
  const theme = ctx.theme ?? DEFAULT_LAUNDRY_THEME;
  const blocked = !ctx.entitlement.allowed && !ctx.isDemo && ctx.tenantSlug !== 'demo-laundry';
  return {
    id: ctx.tenantId,
    tenantId: ctx.tenantId,
    slug: ctx.tenantSlug,
    brandName: ctx.brandName,
    tagline: ctx.tagline || 'The Best Partner in Laundry Service',
    logoUrl: ctx.logoUrl,
    primaryColor: theme.primaryColor || '#9fe870',
    primaryHoverColor: theme.primaryHoverColor || '#8ee05c',
    darkColor: theme.darkColor || '#163300',
    secondaryColor: theme.secondaryColor || '#054d28',
    surfaceColor: theme.surfaceColor || '#e2f6d5',
    theme,
    cityOrRegion: extra?.cityOrRegion ?? 'Surabaya',
    defaultAddress: extra?.defaultAddress ?? null,
    whatsappPhone: ctx.whatsappPhone,
    isDefault: extra?.isDefault ?? ctx.tenantSlug === 'bagus-laundry',
    isDemo: Boolean(ctx.isDemo || ctx.tenantSlug === 'demo-laundry'),
    isActive: !blocked,
    isSubscriptionBlocked: blocked,
    maxBranches: Number(ctx.entitlement.limits?.maxBranches ?? 3),
    subscriptionPlan: 'BASIC_MONTHLY',
    tenantStatus: ctx.entitlement.status || 'ACTIVE',
    subscriptionEndAt: ctx.entitlement.subscriptionEndAt ?? null,
    entitlement: ctx.entitlement,
  };
}

@Controller('public')
@Public()
export class PublicBrandingController {
  @Get('branding')
  getBranding() {
    const ctx = getActiveTenantContext();
    if (!ctx) return null;
    return formatTenantBrandingForClient(ctx);
  }
}

@Controller('tenants')
@Public()
export class TenantsPublicController {
  constructor(
    private readonly platformClient: PlatformClientService,
    @InjectRepository(TenantProfile)
    private readonly profilesRepo: Repository<TenantProfile>,
    @Optional() private readonly demoSeedService?: DemoSeedService,
  ) {}

  @Get('platform-public')
  getPlatformPublic() {
    return {
      settings: {
        id: 'default',
        companyName: 'MNILab',
        tagline: 'Software House & Enterprise SaaS Partner',
        whatsappNumber: '6281217395849',
        supportEmail: 'support@mnilab.id',
        bankName: 'BCA',
        bankAccountNumber: '-',
        bankAccountHolder: 'MNILab Indonesia',
      },
      plans: [],
    };
  }

  @Get('current')
  getCurrent() {
    const ctx = getActiveTenantContext();
    if (!ctx) return null;
    return formatTenantBrandingForClient(ctx);
  }

  @Get('public')
  async listPublicTenants() {
    const profiles = await this.profilesRepo.find({
      order: { isDemo: 'DESC', brandName: 'ASC' },
    });
    const ctx = getActiveTenantContext();
    const mapped = profiles.map((p) => {
      const theme = p.themeConfigJson ?? DEFAULT_LAUNDRY_THEME;
      const blocked =
        !p.isDemo &&
        p.slug !== 'demo-laundry' &&
        ['STOPPED', 'SUSPENDED', 'EXPIRED', 'CANCELLED'].includes(
          (p.subscriptionStatus || 'ACTIVE').toUpperCase(),
        );
      return {
        id: p.tenantId,
        tenantId: p.tenantId,
        slug: p.slug,
        brandName: p.brandName,
        tagline: p.tagline || 'The Best Partner in Laundry Service',
        logoUrl: p.logoUrl,
        primaryColor: theme.primaryColor || '#9fe870',
        primaryHoverColor: theme.primaryHoverColor || '#8ee05c',
        darkColor: theme.darkColor || '#163300',
        secondaryColor: theme.secondaryColor || '#054d28',
        surfaceColor: theme.surfaceColor || '#e2f6d5',
        theme,
        cityOrRegion: 'Surabaya' as string | null,
        defaultAddress: null as string | null,
        whatsappPhone: p.whatsappPhone,
        isDefault: p.slug === 'bagus-laundry',
        isDemo: Boolean(p.isDemo || p.slug === 'demo-laundry'),
        isActive: !blocked,
        isSubscriptionBlocked: blocked,
        maxBranches: Number(p.maxBranches || 3),
        subscriptionPlan: 'BASIC_MONTHLY',
        tenantStatus: p.subscriptionStatus || 'ACTIVE',
        subscriptionEndAt: null as string | null,
        entitlement: undefined as unknown,
      };
    });

    if (ctx && !mapped.some((m) => m.slug === ctx.tenantSlug)) {
      mapped.unshift(formatTenantBrandingForClient(ctx));
    }
    return mapped.filter((m) => !m.isSubscriptionBlocked);
  }

  @Get('public/:slug')
  async getPublicBySlug(@Param('slug') slug: string) {
    const clean = slug?.trim().toLowerCase();
    const ctx = getActiveTenantContext();
    if (!clean || clean === 'default' || (ctx && ctx.tenantSlug === clean)) {
      if (ctx) return formatTenantBrandingForClient(ctx);
    }

    const targetSlug =
      clean && clean !== 'default' ? clean : ctx?.tenantSlug || 'demo-laundry';
    const { tenant, entitlement } =
      await this.platformClient.resolveTenantBySlug(targetSlug);

    await this.profilesRepo.upsert(
      {
        tenantId: tenant.id,
        slug: tenant.slug,
        brandName: tenant.brandName,
        tagline: tenant.tagline,
        logoUrl: tenant.logoUrl,
        themeConfigJson: tenant.theme ?? DEFAULT_LAUNDRY_THEME,
        whatsappPhone: tenant.whatsappPhone,
        isDemo: tenant.isDemo,
        subscriptionStatus: entitlement.status,
        maxBranches: entitlement.limits?.maxBranches ?? 3,
        syncedAt: new Date(),
      },
      ['tenantId'],
    );

    if (
      (tenant.isDemo || tenant.slug === 'demo-laundry') &&
      this.demoSeedService
    ) {
      await this.demoSeedService.ensureDemoSeeded(tenant.id).catch(() => undefined);
    }

    return formatTenantBrandingForClient(
      {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        brandName: tenant.brandName,
        tagline: tenant.tagline,
        logoUrl: tenant.logoUrl,
        theme: tenant.theme ?? DEFAULT_LAUNDRY_THEME,
        whatsappPhone: tenant.whatsappPhone,
        isDemo: tenant.isDemo,
        entitlement,
      },
      {
        cityOrRegion: tenant.cityOrRegion,
        defaultAddress: tenant.defaultAddress,
      },
    );
  }
}
