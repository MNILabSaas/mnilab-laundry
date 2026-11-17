import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../common/utils/numeric.transformer.js';

export interface BranchLandingFeatureItem {
  icon: string;
  title: string;
  description: string;
}

export interface BranchLandingConfig {
  heroSlogan?: string;
  heroDescription?: string;
  features?: BranchLandingFeatureItem[];
}

@Entity('branches')
@Index('UQ_branches_tenant_code', ['tenantId', 'code'], { unique: true })
export class Branch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_branches_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'whatsapp_number', type: 'varchar', length: 30, nullable: true })
  whatsappNumber: string | null;

  @Column({
    name: 'ironing_rate',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 1100,
    transformer: numericTransformer,
  })
  ironingRate: number;

  @Column({ name: 'open_time', type: 'varchar', length: 10, default: '08:00' })
  openTime: string;

  @Column({ name: 'close_time', type: 'varchar', length: 10, default: '21:00' })
  closeTime: string;

  @Column({
    name: 'default_min_weight_kg',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    default: 3,
    transformer: numericTransformer,
  })
  defaultMinWeightKg: number | null;

  @Column({
    name: 'pay_later_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 1000,
    transformer: numericTransformer,
  })
  payLaterFee: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: numericTransformer,
  })
  latitude: number | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: numericTransformer,
  })
  longitude: number | null;

  @Column({ name: 'attendance_radius_meters', type: 'int', default: 10 })
  attendanceRadiusMeters: number;

  @Column({ name: 'is_main', type: 'boolean', default: false })
  isMain: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'landing_config_json', type: 'jsonb', nullable: true })
  landingConfigJson: BranchLandingConfig | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
