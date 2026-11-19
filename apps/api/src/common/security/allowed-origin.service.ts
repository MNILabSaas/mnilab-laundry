import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformClientService } from '../../platform/platform-client.service.js';
import {
  DEFAULT_LAUNDRY_THEME,
  TenantProfile,
} from '../../tenant-context/tenant-profile.entity.js';

export type OriginDecisionReason =
  | 'NO_ORIGIN_HEADER'
  | 'MALFORMED_ORIGIN'
  | 'STATIC_ALLOWLIST'
  | 'PLATFORM_SUBDOMAIN'
  | 'DEV_LOCALHOST'
  | 'INSECURE_PROTOCOL_OR_PORT'
  | 'DOMAIN_NOT_REGISTERED'
  | 'DOMAIN_NOT_VERIFIED'
  | 'TENANT_INACTIVE'
  | 'CUSTOM_DOMAIN_VERIFIED_ACTIVE'
  | 'LOOKUP_ERROR';

export interface OriginValidationResult {
  allowed: boolean;
  reason: OriginDecisionReason;
  normalizedOrigin: string | null;
}

interface ParsedOrigin {
  protocol: string;
  hostname: string;
  port: string;
  normalizedOrigin: string;
}

interface DomainCacheEntry {
  allowed: boolean;
  reason: OriginDecisionReason;
  tenantSlug?: string;
  expiresAt: number;
}

const VALID_CUSTOM_DOMAIN_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const PLATFORM_DOMAIN_REGEX =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)?(?:mnilab\.my\.id|mnilab\.id)$/;

const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'STOPPED',
  'SUSPENDED',
  'EXPIRED',
  'CANCELLED',
]);

/**
 * Dynamic CORS Origin Validator untuk MNILab Laundry.
 * Memvalidasi origin statis, subdomain resmi platform, serta custom domain mitra
 * dari tabel `tenant_profiles` (dengan fallback sinkronisasi aman ke Platform API).
 *
 * Menggunakan cache in-memory per-instance dengan TTL (default 30 detik) dan
 * invalidasi instan via endpoint internal `/internal/tenants/invalidate-cache` tanpa restart PM2.
 */
@Injectable()
export class AllowedOriginService {
  private readonly logger = new Logger(AllowedOriginService.name);
  private readonly domainCache = new Map<string, DomainCacheEntry>();
  private readonly staticAllowedOrigins = new Set<string>();

  private allowedCount = 0;
  private deniedCount = 0;
  private lookupErrorCount = 0;

  constructor(
    @InjectRepository(TenantProfile)
    private readonly profilesRepo: Repository<TenantProfile>,
    private readonly platformClient: PlatformClientService,
  ) {
    this.reloadStaticOrigins();
  }

  private get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private get cacheTtlMs(): number {
    const raw = Number(process.env.CORS_DOMAIN_CACHE_TTL_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
  }

  reloadStaticOrigins(): void {
    this.staticAllowedOrigins.clear();
    const rawList = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : [];
    const defaults = this.isProduction
      ? ['https://laundry.mnilab.my.id', 'https://mnilab.my.id']
      : ['http://localhost:3002', 'http://127.0.0.1:3002', 'http://localhost:3000', 'http://127.0.0.1:3000'];

    for (const item of [...rawList, ...defaults]) {
      const parsed = this.parseAndNormalizeOrigin(item);
      if (parsed) {
        this.staticAllowedOrigins.add(parsed.normalizedOrigin);
      }
    }
  }

  parseAndNormalizeOrigin(rawOrigin: string): ParsedOrigin | null {
    if (!rawOrigin || typeof rawOrigin !== 'string') return null;
    const trimmed = rawOrigin.trim();
    if (!trimmed || /\s/.test(trimmed)) return null;

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }
    const afterHost = trimmed.replace(/^[a-zA-Z]+:\/\/[^/]+/, '');
    if (afterHost !== '' || url.pathname !== '/') {
      return null;
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname) return null;

    const normalizedOrigin = `${url.protocol}//${hostname}${url.port ? `:${url.port}` : ''}`;
    return {
      protocol: url.protocol,
      hostname,
      port: url.port,
      normalizedOrigin,
    };
  }

  normalizeCanonicalDomain(rawDomain?: string | null): string | null {
    if (!rawDomain || typeof rawDomain !== 'string') return null;
    const clean = rawDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\.$/, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .split(':')[0]
      .trim();
    if (!clean || !VALID_CUSTOM_DOMAIN_REGEX.test(clean)) return null;
    if (
      clean === 'mnilab.my.id' ||
      clean === 'mnilab.id' ||
      clean.endsWith('.mnilab.my.id') ||
      clean.endsWith('.mnilab.id') ||
      clean.endsWith('.localhost')
    ) {
      return null;
    }
    return clean;
  }

  /**
   * Mengekstrak canonical custom domain dari header Origin jika origin tersebut
   * adalah custom domain eksternal (bukan domain platform mnilab atau localhost).
   */
  extractCustomDomainFromOrigin(rawOrigin?: string): string | null {
    if (!rawOrigin) return null;
    const parsed = this.parseAndNormalizeOrigin(rawOrigin);
    if (!parsed) return null;
    if (PLATFORM_DOMAIN_REGEX.test(parsed.hostname)) return null;
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname.endsWith('.localhost')
    ) {
      return null;
    }
    return this.normalizeCanonicalDomain(parsed.hostname);
  }

  invalidateDomain(domain?: string | null): void {
    if (!domain) {
      this.domainCache.clear();
      return;
    }
    const clean = this.normalizeCanonicalDomain(domain);
    if (clean) {
      this.domainCache.delete(clean);
    } else {
      this.domainCache.delete(domain.trim().toLowerCase().replace(/^www\./, ''));
    }
  }

  getMetrics() {
    return {
      allowedCount: this.allowedCount,
      deniedCount: this.deniedCount,
      lookupErrorCount: this.lookupErrorCount,
      cacheSize: this.domainCache.size,
    };
  }

  async validateOrigin(requestOrigin?: string): Promise<OriginValidationResult> {
    if (!requestOrigin) {
      this.allowedCount += 1;
      return {
        allowed: true,
        reason: 'NO_ORIGIN_HEADER',
        normalizedOrigin: null,
      };
    }

    const parsed = this.parseAndNormalizeOrigin(requestOrigin);
    if (!parsed) {
      this.deniedCount += 1;
      this.logger.debug('CORS denied: reason=MALFORMED_ORIGIN');
      return {
        allowed: false,
        reason: 'MALFORMED_ORIGIN',
        normalizedOrigin: null,
      };
    }

    // 1. Exact match pada daftar origin statis (CORS_ORIGIN)
    if (this.staticAllowedOrigins.has(parsed.normalizedOrigin)) {
      this.allowedCount += 1;
      return {
        allowed: true,
        reason: 'STATIC_ALLOWLIST',
        normalizedOrigin: parsed.normalizedOrigin,
      };
    }

    // 2. Subdomain resmi MNILab (*.mnilab.my.id / *.mnilab.id)
    if (PLATFORM_DOMAIN_REGEX.test(parsed.hostname)) {
      if (this.isProduction && (parsed.protocol !== 'https:' || parsed.port !== '')) {
        this.deniedCount += 1;
        this.logger.debug(
          `CORS denied: origin=${parsed.normalizedOrigin} reason=INSECURE_PROTOCOL_OR_PORT`,
        );
        return {
          allowed: false,
          reason: 'INSECURE_PROTOCOL_OR_PORT',
          normalizedOrigin: parsed.normalizedOrigin,
        };
      }
      this.allowedCount += 1;
      return {
        allowed: true,
        reason: 'PLATFORM_SUBDOMAIN',
        normalizedOrigin: parsed.normalizedOrigin,
      };
    }

    // 3. Localhost development (hanya non-production)
    if (
      !this.isProduction &&
      (parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.localhost$/.test(parsed.hostname))
    ) {
      this.allowedCount += 1;
      return {
        allowed: true,
        reason: 'DEV_LOCALHOST',
        normalizedOrigin: parsed.normalizedOrigin,
      };
    }

    // 4. Custom Domain Tenant: wajib HTTPS dan port standar (kosong)
    const allowHttpCustomDev =
      !this.isProduction && process.env.ALLOW_HTTP_CUSTOM_DOMAIN_DEV === 'true';
    const isAllowedScheme =
      parsed.protocol === 'https:' ||
      (allowHttpCustomDev && parsed.protocol === 'http:');
    if (!isAllowedScheme || parsed.port !== '') {
      this.deniedCount += 1;
      this.logger.debug(
        `CORS denied: origin=${parsed.normalizedOrigin} reason=INSECURE_PROTOCOL_OR_PORT`,
      );
      return {
        allowed: false,
        reason: 'INSECURE_PROTOCOL_OR_PORT',
        normalizedOrigin: parsed.normalizedOrigin,
      };
    }

    const canonicalDomain = parsed.hostname.startsWith('www.')
      ? parsed.hostname.slice(4)
      : parsed.hostname;

    if (
      !canonicalDomain ||
      !VALID_CUSTOM_DOMAIN_REGEX.test(canonicalDomain) ||
      (parsed.hostname !== canonicalDomain &&
        parsed.hostname !== `www.${canonicalDomain}`)
    ) {
      this.deniedCount += 1;
      this.logger.debug(
        `CORS denied: origin=${parsed.normalizedOrigin} reason=DOMAIN_NOT_REGISTERED`,
      );
      return {
        allowed: false,
        reason: 'DOMAIN_NOT_REGISTERED',
        normalizedOrigin: parsed.normalizedOrigin,
      };
    }

    const now = Date.now();
    const cached = this.domainCache.get(canonicalDomain);
    if (cached && cached.expiresAt > now) {
      if (cached.allowed) {
        this.allowedCount += 1;
      } else {
        this.deniedCount += 1;
        this.logger.debug(
          `CORS denied (cached): origin=${parsed.normalizedOrigin} reason=${cached.reason}`,
        );
      }
      return {
        allowed: cached.allowed,
        reason: cached.reason,
        normalizedOrigin: parsed.normalizedOrigin,
      };
    }

    try {
      let profile = await this.profilesRepo.findOne({
        where: { customDomain: canonicalDomain },
      });

      // Fallback sinkronisasi satu arah ke Platform API jika belum ada di snapshot lokal
      if (!profile) {
        try {
          const resolved = await this.platformClient.resolveTenantBySlug(canonicalDomain);
          if (
            resolved?.tenant &&
            resolved.tenant.customDomain?.toLowerCase() === canonicalDomain
          ) {
            await this.profilesRepo.upsert(
              {
                tenantId: resolved.tenant.id,
                slug: resolved.tenant.slug,
                customDomain: resolved.tenant.customDomain ?? null,
                customDomainVerified: Boolean(resolved.tenant.customDomainVerified),
                customDomainVerifiedAt: resolved.tenant.customDomainVerifiedAt
                  ? new Date(resolved.tenant.customDomainVerifiedAt)
                  : null,
                brandName: resolved.tenant.brandName,
                tagline: resolved.tenant.tagline,
                logoUrl: resolved.tenant.logoUrl,
                themeConfigJson: resolved.tenant.theme ?? DEFAULT_LAUNDRY_THEME,
                whatsappPhone: resolved.tenant.whatsappPhone,
                isDemo: resolved.tenant.isDemo,
                subscriptionStatus: resolved.entitlement.status,
                maxBranches: resolved.entitlement.limits?.maxBranches ?? 3,
                syncedAt: new Date(),
              },
              ['tenantId'],
            );
            profile = await this.profilesRepo.findOne({
              where: { customDomain: canonicalDomain },
            });
          }
        } catch {
          // Abaikan 404 dari platformClient, akan ditangani sebagai DOMAIN_NOT_REGISTERED
        }
      }

      let decision: { allowed: boolean; reason: OriginDecisionReason; tenantSlug?: string };
      if (!profile || profile.customDomain?.toLowerCase() !== canonicalDomain) {
        decision = { allowed: false, reason: 'DOMAIN_NOT_REGISTERED' };
      } else if (!profile.customDomainVerified) {
        decision = {
          allowed: false,
          reason: 'DOMAIN_NOT_VERIFIED',
          tenantSlug: profile.slug,
        };
      } else if (
        !profile.isDemo &&
        INACTIVE_SUBSCRIPTION_STATUSES.has(
          (profile.subscriptionStatus || 'ACTIVE').toUpperCase(),
        )
      ) {
        decision = {
          allowed: false,
          reason: 'TENANT_INACTIVE',
          tenantSlug: profile.slug,
        };
      } else {
        decision = {
          allowed: true,
          reason: 'CUSTOM_DOMAIN_VERIFIED_ACTIVE',
          tenantSlug: profile.slug,
        };
      }

      this.domainCache.set(canonicalDomain, {
        ...decision,
        expiresAt: now + this.cacheTtlMs,
      });

      if (decision.allowed) {
        this.allowedCount += 1;
      } else {
        this.deniedCount += 1;
        this.logger.debug(
          `CORS denied: origin=${parsed.normalizedOrigin} reason=${decision.reason}`,
        );
      }

      return {
        allowed: decision.allowed,
        reason: decision.reason,
        normalizedOrigin: parsed.normalizedOrigin,
      };
    } catch (err) {
      // Fail-closed: kegagalan database tidak boleh meloloskan custom origin
      this.lookupErrorCount += 1;
      this.deniedCount += 1;
      this.logger.warn(
        `CORS custom domain lookup gagal untuk host="${canonicalDomain}": ${err instanceof Error ? err.message : 'DB error'}`,
      );
      return {
        allowed: false,
        reason: 'LOOKUP_ERROR',
        normalizedOrigin: parsed.normalizedOrigin,
      };
    }
  }
}
