import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Public } from '../common/auth/auth.decorators.js';
import { PlatformClientService } from '../platform/platform-client.service.js';
import { DemoSeedService } from './demo-seed.service.js';

@Controller('internal')
@Public()
export class InternalLaundryController {
  constructor(
    private readonly demoSeedService: DemoSeedService,
    private readonly platformClient: PlatformClientService,
  ) {}

  private assertInternalSecret(req: Request) {
    const provided = req.headers['x-internal-service-secret'];
    const expected =
      process.env.PLATFORM_INTERNAL_SECRET?.trim() ||
      'mnilab-internal-dev-secret-change-2026';
    if (typeof provided !== 'string') {
      throw new UnauthorizedException('Invalid internal service secret');
    }
    const a = Buffer.from(provided.trim(), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid internal service secret');
    }
  }

  @Post('demo/seed')
  @HttpCode(200)
  async seedDemo(
    @Req() req: Request,
    @Body() body: { forceReset?: boolean },
  ) {
    this.assertInternalSecret(req);
    return this.demoSeedService.ensureDemoSeededBySlug(Boolean(body?.forceReset));
  }

  @Post('tenants/provision')
  @HttpCode(200)
  async provisionTenant(
    @Req() req: Request,
    @Body()
    body: {
      tenant: {
        id: string;
        slug: string;
        customDomain?: string | null;
        brandName: string;
        tagline?: string;
        logoUrl?: string | null;
        theme?: Record<string, string>;
        whatsappPhone?: string | null;
        isDemo?: boolean;
      };
      maxBranches?: number;
      owner: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
      };
    },
  ) {
    this.assertInternalSecret(req);
    return this.demoSeedService.provisionPartnerTenant(body);
  }

  @Post('tenants/invalidate-cache')
  @HttpCode(200)
  invalidateCache(
    @Req() req: Request,
    @Body() body: { tenantId?: string; slug?: string },
  ) {
    this.assertInternalSecret(req);
    this.platformClient.invalidateTenantCache(body?.tenantId, body?.slug);
    return { invalidated: true };
  }

  @Get('tenants/stats')
  async getAllStats(@Req() req: Request) {
    this.assertInternalSecret(req);
    return this.demoSeedService.getAllTenantsStats();
  }

  @Delete('tenants/:tenantId')
  async deleteTenantData(
    @Req() req: Request,
    @Param('tenantId') tenantId: string,
  ) {
    this.assertInternalSecret(req);
    this.platformClient.invalidateTenantCache(tenantId);
    return { deleted: true };
  }
}
