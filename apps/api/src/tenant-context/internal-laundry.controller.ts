import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Public } from '../common/auth/auth.decorators.js';
import { AllowedOriginService } from '../common/security/allowed-origin.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PlatformClientService } from '../platform/platform-client.service.js';
import { DemoSeedService } from './demo-seed.service.js';
import {
  DEFAULT_LAUNDRY_THEME,
  type TenantBankAccountItem,
  TenantProfile,
} from './tenant-profile.entity.js';

@Controller('internal')
@Public()
export class InternalLaundryController {
  constructor(
    private readonly demoSeedService: DemoSeedService,
    private readonly platformClient: PlatformClientService,
    @Optional()
    @InjectRepository(TenantProfile)
    private readonly profilesRepo?: Repository<TenantProfile>,
    @Optional() private readonly allowedOriginService?: AllowedOriginService,
    @Optional() private readonly paymentsService?: PaymentsService,
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
        customDomainVerified?: boolean;
        customDomainVerifiedAt?: string | null;
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
    const res = await this.demoSeedService.provisionPartnerTenant(body);
    if (body?.tenant?.customDomain) {
      this.allowedOriginService?.invalidateDomain(body.tenant.customDomain);
    }
    return res;
  }

  @Post('tenants/invalidate-cache')
  @HttpCode(200)
  async invalidateCache(
    @Req() req: Request,
    @Body()
    body: {
      tenantId?: string;
      slug?: string;
      customDomain?: string | null;
      previousCustomDomain?: string | null;
    },
  ) {
    this.assertInternalSecret(req);
    this.platformClient.invalidateTenantCache(
      body?.tenantId,
      body?.slug,
      body?.customDomain,
    );
    if (body?.previousCustomDomain) {
      this.platformClient.invalidateTenantCache(
        undefined,
        undefined,
        body.previousCustomDomain,
      );
      this.allowedOriginService?.invalidateDomain(body.previousCustomDomain);
    }
    if (body?.customDomain) {
      this.allowedOriginService?.invalidateDomain(body.customDomain);
    }

    // Sinkronkan profil tenant lokal di mnilab_laundry agar perubahan domain/status langsung berlaku
    if (this.profilesRepo && (body?.tenantId || body?.slug)) {
      const existingProfile = body.tenantId
        ? await this.profilesRepo.findOne({ where: { tenantId: body.tenantId } })
        : body.slug
          ? await this.profilesRepo.findOne({ where: { slug: body.slug } })
          : null;
      if (existingProfile?.customDomain) {
        this.allowedOriginService?.invalidateDomain(existingProfile.customDomain);
      }

      const targetSlug = body?.slug || existingProfile?.slug;
      if (targetSlug) {
        try {
          const { tenant, entitlement } =
            await this.platformClient.resolveTenantBySlug(targetSlug);
          await this.profilesRepo.upsert(
            {
              tenantId: tenant.id,
              slug: tenant.slug,
              customDomain: tenant.customDomain ?? null,
              customDomainVerified: Boolean(tenant.customDomainVerified),
              customDomainVerifiedAt: tenant.customDomainVerifiedAt
                ? new Date(tenant.customDomainVerifiedAt)
                : null,
              brandName: tenant.brandName,
              tagline: tenant.tagline,
              logoUrl: tenant.logoUrl,
              themeConfigJson: tenant.theme ?? DEFAULT_LAUNDRY_THEME,
              whatsappPhone: tenant.whatsappPhone,
              bankAccountsJson:
                tenant.bankAccountsJson ?? tenant.bankAccounts ?? [],
              qrisConfigJson: tenant.qrisConfigJson ?? null,
              isDemo: tenant.isDemo,
              subscriptionStatus: entitlement.status,
              maxBranches: entitlement.limits?.maxBranches ?? 3,
              syncedAt: new Date(),
            },
            ['tenantId'],
          );
          if (tenant.customDomain) {
            this.allowedOriginService?.invalidateDomain(tenant.customDomain);
          }
        } catch {
          // ignore if platform unreachable during invalidation
        }
      }
    }

    return { invalidated: true };
  }

  @Get('tenants/stats')
  async getAllStats(@Req() req: Request) {
    this.assertInternalSecret(req);
    return this.demoSeedService.getAllTenantsStats();
  }

  @Get('qris-withdrawals/overview')
  async getQrisWithdrawalsOverview(
    @Req() req: Request,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    this.assertInternalSecret(req);
    if (!this.paymentsService) {
      return {
        month: 0,
        year: new Date().getFullYear(),
        globalSummary: {
          totalQrisCollected: 0,
          totalWithdrawnApproved: 0,
          totalPendingWithdrawal: 0,
          totalUnwithdrawnBalance: 0,
          pendingRequestsCount: 0,
        },
        tenantSummaries: [],
        withdrawals: [],
      };
    }
    return this.paymentsService.getAllTenantsQrisOverviewForInternal({
      month: month !== undefined ? Number(month) : undefined,
      year: year !== undefined ? Number(year) : undefined,
      tenantId,
    });
  }

  @Patch('qris-withdrawals/:id/review')
  async reviewQrisWithdrawal(
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    body: {
      status: 'APPROVED' | 'REJECTED';
      transferProof?: string | null;
      targetBankAccount?: TenantBankAccountItem | null;
      adminNotes?: string | null;
      rejectionReason?: string | null;
      reviewedByEmail: string;
    },
  ) {
    this.assertInternalSecret(req);
    if (!this.paymentsService) {
      throw new UnauthorizedException('PaymentsService unavailable');
    }
    return this.paymentsService.reviewQrisWithdrawalInternal(id, body);
  }

  @Delete('tenants/:tenantId')
  async deleteTenantData(
    @Req() req: Request,
    @Param('tenantId') tenantId: string,
  ) {
    this.assertInternalSecret(req);
    if (this.profilesRepo) {
      const existing = await this.profilesRepo.findOne({ where: { tenantId } });
      if (existing?.customDomain) {
        this.allowedOriginService?.invalidateDomain(existing.customDomain);
      }
      await this.profilesRepo.delete({ tenantId });
    }
    this.platformClient.invalidateTenantCache(tenantId);
    return { deleted: true };
  }
}
