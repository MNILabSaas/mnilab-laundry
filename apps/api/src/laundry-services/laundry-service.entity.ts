import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Branch } from '../branches/branch.entity.js';
import { PriceUnit, WorkflowCode } from '../common/enums.js';
import { numericTransformer } from '../common/utils/numeric.transformer.js';

@Entity('laundry_services')
@Check('CHK_laundry_services_price', `"price" >= 0`)
@Check('CHK_laundry_services_min_weight', `"min_weight_kg" IS NULL OR "min_weight_kg" > 0`)
@Check(
  'CHK_laundry_services_duration',
  `"estimated_duration_hours" IS NULL OR "estimated_duration_hours" > 0`,
)
export class LaundryService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_laundry_services_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_laundry_services_branch')
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch?: Relation<Branch> | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 30 })
  workflow: WorkflowCode;

  @Column({ name: 'price_unit', type: 'varchar', length: 20 })
  priceUnit: PriceUnit;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  price: number;

  @Column({
    name: 'min_weight_kg',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  minWeightKg: number | null;

  @Column({ name: 'estimated_duration_hours', type: 'int', nullable: true })
  estimatedDurationHours: number | null;

  @Column({ name: 'discount_type', type: 'varchar', length: 20, default: 'NONE' })
  discountType: 'NONE' | 'PERCENTAGE' | 'FIXED';

  @Column({
    name: 'discount_value',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discountValue: number;

  @Column({ name: 'discount_active', type: 'boolean', default: false })
  discountActive: boolean;

  @Column({ name: 'is_third_party', type: 'boolean', default: false })
  isThirdParty: boolean;

  @Column({ name: 'third_party_partner', type: 'varchar', length: 150, nullable: true })
  thirdPartyPartner: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
