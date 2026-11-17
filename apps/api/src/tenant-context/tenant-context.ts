import { AsyncLocalStorage } from 'node:async_hooks';
import type { TenantThemeConfig } from './tenant-profile.entity.js';

export interface PlatformEntitlement {
  tenantId: string;
  tenantSlug: string;
  productCode: string;
  allowed: boolean;
  status: string;
  isDemo: boolean;
  reason: string | null;
  limits: { maxBranches: number; maxStaff?: number };
  features: string[];
  subscriptionEndAt: string | null;
}

export interface ActiveTenantContext {
  tenantId: string;
  tenantSlug: string;
  brandName: string;
  tagline: string;
  logoUrl: string | null;
  theme: TenantThemeConfig;
  whatsappPhone: string | null;
  isDemo: boolean;
  entitlement: PlatformEntitlement;
}

const tenantStorage = new AsyncLocalStorage<ActiveTenantContext>();

export function runWithTenantContext<T>(
  ctx: ActiveTenantContext,
  fn: () => T,
): T {
  return tenantStorage.run(ctx, fn);
}

export function getActiveTenantContext(): ActiveTenantContext | undefined {
  return tenantStorage.getStore();
}
