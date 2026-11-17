import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface FeatureHighlightItem {
  icon: string;
  title: string;
  description: string;
}

export interface TenantLandingConfig {
  heroSlogan?: string;
  heroDescription?: string;
  features?: FeatureHighlightItem[];
}

export interface TenantThemeConfig {
  primaryColor: string;
  primaryHoverColor: string;
  darkColor: string;
  secondaryColor: string;
  surfaceColor: string;
  landingConfig?: TenantLandingConfig;
}

export const DEFAULT_LAUNDRY_THEME: TenantThemeConfig = {
  primaryColor: '#9fe870',
  primaryHoverColor: '#8ee05c',
  darkColor: '#163300',
  secondaryColor: '#054d28',
  surfaceColor: '#e2f6d5',
};

/**
 * Snapshot ringan profil tenant & status entitlement dari MNILab Platform.
 * Sumber kebenaran billing tetap berada di `mnilab_main`.
 */
@Entity('tenant_profiles')
export class TenantProfile {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('UQ_tenant_profiles_slug', { unique: true })
  @Column({ type: 'varchar', length: 80 })
  slug: string;

  @Column({ name: 'brand_name', type: 'varchar', length: 120 })
  brandName: string;

  @Column({
    type: 'varchar',
    length: 200,
    default: 'Mitra Laundry Terpercaya',
  })
  tagline: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({
    name: 'theme_config_json',
    type: 'jsonb',
    default: () => `'${JSON.stringify(DEFAULT_LAUNDRY_THEME)}'`,
  })
  themeConfigJson: TenantThemeConfig;

  @Column({ name: 'whatsapp_phone', type: 'varchar', length: 30, nullable: true })
  whatsappPhone: string | null;

  @Column({ name: 'is_demo', type: 'boolean', default: false })
  isDemo: boolean;

  @Column({
    name: 'subscription_status',
    type: 'varchar',
    length: 30,
    default: 'ACTIVE',
  })
  subscriptionStatus: string;

  @Column({ name: 'max_branches', type: 'int', default: 3 })
  maxBranches: number;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'now()' })
  syncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
