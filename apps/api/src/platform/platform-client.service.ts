import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  PlatformEntitlement,
} from '../tenant-context/tenant-context.js';
import type { TenantThemeConfig } from '../tenant-context/tenant-profile.entity.js';

export interface PlatformTenantBranding {
  id: string;
  slug: string;
  brandName: string;
  tagline: string;
  logoUrl: string | null;
  theme: TenantThemeConfig;
  cityOrRegion: string | null;
  defaultAddress: string | null;
  whatsappPhone: string | null;
  status: string;
  isDemo: boolean;
  isActive: boolean;
}

export interface PlatformAuthPayload {
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    platformRole: string;
  };
  tenant: PlatformTenantBranding;
  membership: {
    id: string;
    role: 'TENANT_OWNER' | 'TENANT_ADMIN' | 'TENANT_STAFF';
  };
  entitlement: PlatformEntitlement;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class PlatformClientService {
  private readonly logger = new Logger(PlatformClientService.name);
  private readonly entitlementCache = new Map<string, CacheEntry<PlatformEntitlement>>();
  private readonly slugCache = new Map<
    string,
    CacheEntry<{ tenant: PlatformTenantBranding; entitlement: PlatformEntitlement }>
  >();

  private get baseUrl(): string {
    return (process.env.PLATFORM_API_URL || 'http://127.0.0.1:3001')
      .trim()
      .replace(/\/$/, '');
  }

  private get internalSecret(): string {
    const configured = process.env.PLATFORM_INTERNAL_SECRET?.trim();
    const env = process.env.NODE_ENV;
    if (configured) return configured;
    if (env === 'development' || env === 'test') {
      return 'mnilab-internal-dev-secret-change-2026';
    }
    throw new Error('PLATFORM_INTERNAL_SECRET wajib diatur pada environment produksi');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-Internal-Service-Secret', this.internalSecret);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(8_000),
      });
    } catch (err) {
      this.logger.warn(`Gagal menghubungi MNILab Platform (${path}): ${String(err)}`);
      throw new BadGatewayException(
        'Koneksi ke layanan autentikasi MNILab Platform sedang tidak tersedia',
      );
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const message =
        typeof parsed === 'object' &&
        parsed !== null &&
        'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : `Platform API error (${res.status})`;
      throw new HttpException(message, res.status);
    }

    return parsed as T;
  }

  invalidateTenantCache(tenantId?: string, slug?: string) {
    if (tenantId) this.entitlementCache.delete(tenantId);
    if (slug) this.slugCache.delete(slug.toLowerCase());
  }

  async resolveTenantBySlug(
    slug: string,
  ): Promise<{ tenant: PlatformTenantBranding; entitlement: PlatformEntitlement }> {
    const key = slug.trim().toLowerCase();
    const cached = this.slugCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const data = await this.request<{
      tenant: PlatformTenantBranding;
      entitlement: PlatformEntitlement;
    }>(`/internal/tenants/by-slug/${encodeURIComponent(key)}`);
    this.slugCache.set(key, { value: data, expiresAt: Date.now() + 30_000 });
    this.entitlementCache.set(data.tenant.id, {
      value: data.entitlement,
      expiresAt: Date.now() + 30_000,
    });
    return data;
  }

  async getEntitlement(tenantId: string, forceRefresh = false): Promise<PlatformEntitlement> {
    if (!forceRefresh) {
      const cached = this.entitlementCache.get(tenantId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }
    const data = await this.request<PlatformEntitlement>(
      `/internal/entitlements?tenantId=${encodeURIComponent(tenantId)}&productCode=LAUNDRY`,
    );
    this.entitlementCache.set(tenantId, {
      value: data,
      expiresAt: Date.now() + 30_000,
    });
    return data;
  }

  verifyCredentials(params: {
    tenantSlug: string;
    identifier: string;
    password: string;
  }): Promise<PlatformAuthPayload> {
    return this.request<PlatformAuthPayload>('/internal/auth/verify-credentials', {
      method: 'POST',
      body: JSON.stringify({
        ...params,
        productCode: 'LAUNDRY',
      }),
    });
  }

  exchangeLaunchToken(launchCode: string): Promise<PlatformAuthPayload> {
    return this.request<PlatformAuthPayload>('/internal/auth/exchange-launch-token', {
      method: 'POST',
      body: JSON.stringify({
        launchCode,
        productCode: 'LAUNDRY',
      }),
    });
  }

  provisionStaffAccount(params: {
    tenantId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    password: string;
    membershipRole?: 'TENANT_OWNER' | 'TENANT_ADMIN' | 'TENANT_STAFF';
  }) {
    return this.request<{ user: { id: string } }>('/internal/staff-accounts', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  updateStaffAccount(
    platformUserId: string,
    params: {
      tenantId: string;
      name?: string;
      email?: string | null;
      phone?: string | null;
      newPassword?: string;
      isActive?: boolean;
    },
  ) {
    return this.request(`/internal/staff-accounts/${encodeURIComponent(platformUserId)}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  }
}
