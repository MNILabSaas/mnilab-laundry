import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth/auth.decorators.js';
import { getActiveTenantContext } from './tenant-context.js';

@Controller('public')
@Public()
export class PublicBrandingController {
  @Get('branding')
  getBranding() {
    const ctx = getActiveTenantContext();
    if (!ctx) return null;
    return {
      tenantId: ctx.tenantId,
      slug: ctx.tenantSlug,
      brandName: ctx.brandName,
      tagline: ctx.tagline,
      logoUrl: ctx.logoUrl,
      theme: ctx.theme,
      whatsappPhone: ctx.whatsappPhone,
      isDemo: ctx.isDemo,
      entitlement: ctx.entitlement,
    };
  }
}
