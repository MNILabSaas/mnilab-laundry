import { Body, Controller, Patch } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser, type LaundryAuthUser, Roles } from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { PlatformClientService } from '../platform/platform-client.service.js';
import { formatTenantBrandingForClient } from './public-branding.controller.js';
import {
  DEFAULT_LAUNDRY_THEME,
  TenantProfile,
  type TenantThemeConfig,
} from './tenant-profile.entity.js';

export class UpdateTenantBrandingDto {
  brandName?: string;
  tagline?: string;
  logoUrl?: string | null;
  whatsappPhone?: string | null;
  themeConfigJson?: Partial<TenantThemeConfig>;
}

@Controller('tenant-branding')
@Roles(UserRole.SUPER_OWNER)
export class TenantBrandingController {
  constructor(
    @InjectRepository(TenantProfile)
    private readonly profilesRepo: Repository<TenantProfile>,
    private readonly platformClient: PlatformClientService,
  ) {}

  @Patch()
  async updateBranding(
    @CurrentUser() actor: LaundryAuthUser,
    @Body() dto: UpdateTenantBrandingDto,
  ) {
    let profile = await this.profilesRepo.findOne({
      where: { tenantId: actor.tenantId },
    });
    if (!profile) {
      profile = this.profilesRepo.create({
        tenantId: actor.tenantId,
        slug: actor.tenantSlug,
        brandName: 'Laundry',
      });
    }

    if (dto.brandName !== undefined) profile.brandName = dto.brandName;
    if (dto.tagline !== undefined) profile.tagline = dto.tagline;
    if (dto.logoUrl !== undefined) profile.logoUrl = dto.logoUrl;
    if (dto.whatsappPhone !== undefined) profile.whatsappPhone = dto.whatsappPhone;
    if (dto.themeConfigJson) {
      profile.themeConfigJson = {
        ...(profile.themeConfigJson ?? DEFAULT_LAUNDRY_THEME),
        ...dto.themeConfigJson,
      };
    }
    await this.profilesRepo.save(profile);

    await this.platformClient
      .updateTenantBranding(actor.tenantId, {
        brandName: dto.brandName,
        tagline: dto.tagline,
        logoUrl: dto.logoUrl,
        whatsappPhone: dto.whatsappPhone,
        themeConfigJson: profile.themeConfigJson,
      })
      .catch(() => undefined);

    this.platformClient.invalidateTenantCache(actor.tenantId, profile.slug);

    return formatTenantBrandingForClient({
      tenantId: profile.tenantId,
      tenantSlug: profile.slug,
      customDomain: profile.customDomain ?? null,
      brandName: profile.brandName,
      tagline: profile.tagline,
      logoUrl: profile.logoUrl,
      theme: profile.themeConfigJson ?? DEFAULT_LAUNDRY_THEME,
      whatsappPhone: profile.whatsappPhone,
      isDemo: profile.isDemo,
      entitlement: {
        tenantId: profile.tenantId,
        tenantSlug: profile.slug,
        productCode: 'LAUNDRY',
        allowed: true,
        status: profile.subscriptionStatus || 'ACTIVE',
        isDemo: profile.isDemo,
        reason: null,
        features: [],
        subscriptionEndAt: null,
        limits: { maxBranches: profile.maxBranches },
      },
    });
  }
}
