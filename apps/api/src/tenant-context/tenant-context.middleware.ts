import {
  BadRequestException,
  Injectable,
  type NestMiddleware,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { Repository } from 'typeorm';
import {
  extractBearerOrCookieToken,
  LAUNDRY_AUTH_COOKIE,
} from '../common/utils/auth-http.js';
import {
  PlatformClientService,
  type PlatformTenantBranding,
} from '../platform/platform-client.service.js';
import { DemoSeedService } from './demo-seed.service.js';
import {
  type ActiveTenantContext,
  type PlatformEntitlement,
  runWithTenantContext,
} from './tenant-context.js';
import {
  DEFAULT_LAUNDRY_THEME,
  TenantProfile,
} from './tenant-profile.entity.js';

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'mnilab',
  'api',
  'admin',
  'portal',
  'laundry',
  'app',
]);

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly platformClient: PlatformClientService,
    private readonly jwtService: JwtService,
    @InjectRepository(TenantProfile)
    private readonly profilesRepo: Repository<TenantProfile>,
    @Optional() private readonly demoSeedService?: DemoSeedService,
  ) {}

  private extractSubdomainSlug(req: Request): string | undefined {
    const rawHost =
      (typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host'].split(',')[0]
        : req.headers.host) || '';
    const hostname = rawHost.split(':')[0].trim().toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
      return undefined;
    }

    for (const suffix of ['.mnilab.my.id', '.mnilab.id', '.localhost']) {
      if (hostname.endsWith(suffix)) {
        const sub = hostname.slice(0, -suffix.length);
        if (sub && !sub.includes('.') && !RESERVED_SUBDOMAINS.has(sub)) {
          return sub === 'demo' ? 'demo-laundry' : sub;
        }
        return undefined;
      }
    }

    // Jika diakses dari Custom Domain mandiri (misal berkahlaundry.com atau www.berkahlaundry.id)
    if (
      hostname.includes('.') &&
      hostname !== 'mnilab.my.id' &&
      hostname !== 'mnilab.id' &&
      !hostname.endsWith('.ngrok-free.dev') &&
      !hostname.endsWith('.ngrok-free.app') &&
      !hostname.endsWith('.ngrok.app')
    ) {
      return hostname.replace(/^www\./, '');
    }
    return undefined;
  }

  async syncTenantProfile(
    tenant: PlatformTenantBranding,
    entitlement: PlatformEntitlement,
  ): Promise<void> {
    await this.profilesRepo.upsert(
      {
        tenantId: tenant.id,
        slug: tenant.slug,
        customDomain: tenant.customDomain ?? null,
        brandName: tenant.brandName,
        tagline: tenant.tagline,
        logoUrl: tenant.logoUrl,
        themeConfigJson: tenant.theme ?? DEFAULT_LAUNDRY_THEME,
        whatsappPhone: tenant.whatsappPhone,
        isDemo: tenant.isDemo,
        subscriptionStatus: entitlement.status,
        maxBranches: entitlement.limits?.maxBranches ?? 1,
        syncedAt: new Date(),
      },
      ['tenantId'],
    );
  }

  async use(
    req: Request & { tenantContext?: ActiveTenantContext },
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const path = req.originalUrl || req.url || '';
    if (
      path.startsWith('/health') ||
      path.startsWith('/internal/') ||
      path.startsWith('/auth/sso/exchange') ||
      path.startsWith('/auth/logout')
    ) {
      next();
      return;
    }

    const headerSlugRaw = req.headers['x-tenant-slug'];
    const headerSlugClean =
      typeof headerSlugRaw === 'string' && headerSlugRaw.trim()
        ? headerSlugRaw.trim().toLowerCase()
        : undefined;
    const headerSlug =
      headerSlugClean && headerSlugClean !== 'default'
        ? headerSlugClean
        : undefined;
    const querySlugClean =
      typeof req.query?.tenant === 'string' && req.query.tenant.trim()
        ? req.query.tenant.trim().toLowerCase()
        : undefined;
    const querySlug =
      querySlugClean && querySlugClean !== 'default'
        ? querySlugClean
        : undefined;

    let tokenTenantSlug: string | undefined;
    const token = extractBearerOrCookieToken(req, LAUNDRY_AUTH_COOKIE);
    if (token) {
      try {
        const decoded = await this.jwtService.verifyAsync<{
          tenantSlug?: string;
          aud?: string;
        }>(token, { algorithms: ['HS256'] });
        if (decoded?.aud === 'mnilab-laundry' && decoded?.tenantSlug) {
          tokenTenantSlug = decoded.tenantSlug.trim().toLowerCase();
        }
      } catch {
        // Biarkan LaundryJwtAuthGuard menangani token tidak valid
      }
    }

    const explicitSlug = headerSlug || querySlug || this.extractSubdomainSlug(req);
    const isAuthLogin = path.startsWith('/auth/login');

    if (
      tokenTenantSlug &&
      explicitSlug &&
      explicitSlug !== tokenTenantSlug &&
      !isAuthLogin
    ) {
      throw new UnauthorizedException(
        'Sesi login Anda terdaftar pada mitra laundry yang berbeda. Silakan login kembali.',
      );
    }

    const effectiveSlug =
      tokenTenantSlug ||
      explicitSlug ||
      (process.env.DEFAULT_DEMO_TENANT_SLUG?.trim().toLowerCase() || 'demo-laundry');

    if (!effectiveSlug) {
      throw new BadRequestException('Identitas tenant (slug) tidak ditemukan');
    }

    const { tenant, entitlement } =
      await this.platformClient.resolveTenantBySlug(effectiveSlug);

    await this.syncTenantProfile(tenant, entitlement);
    if (
      (tenant.isDemo || tenant.slug === 'demo-laundry') &&
      this.demoSeedService
    ) {
      await this.demoSeedService.ensureDemoSeeded(tenant.id).catch(() => undefined);
    }

    const ctx: ActiveTenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      customDomain: tenant.customDomain ?? null,
      brandName: tenant.brandName,
      tagline: tenant.tagline,
      logoUrl: tenant.logoUrl,
      theme: tenant.theme ?? DEFAULT_LAUNDRY_THEME,
      whatsappPhone: tenant.whatsappPhone,
      isDemo: tenant.isDemo,
      entitlement,
    };

    req.tenantContext = ctx;
    runWithTenantContext(ctx, () => {
      next();
    });
  }
}
