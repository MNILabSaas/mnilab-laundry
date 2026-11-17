import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { ItemStatus, PriceUnit, WorkflowCode } from '../common/enums.js';
import { numericTransformer } from '../common/utils/numeric.transformer.js';
import { LaundryService } from '../laundry-services/laundry-service.entity.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { IroningPayout } from '../workflow/ironing-payout.entity.js';
import { OrderStatusHistory } from '../workflow/order-status-history.entity.js';
import { LaundryOrder } from './laundry-order.entity.js';

@Entity('laundry_order_items')
@Check('CHK_laundry_order_items_amounts', `"quantity" > 0 AND "unit_price" >= 0 AND "item_total" >= 0`)
@Check('CHK_laundry_order_items_weight', `"weight_kg" IS NULL OR "weight_kg" > 0`)
@Check('CHK_laundry_order_items_garment_count', `"garment_count" IS NULL OR "garment_count" > 0`)
@Check('CHK_laundry_order_items_done_rack', `"status" <> 'SELESAI' OR "rack_number" IS NOT NULL`)
export class LaundryOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_laundry_order_items_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_laundry_order_items_order')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => LaundryOrder, (order) => order.items, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<LaundryOrder>;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId: string;

  @ManyToOne(() => LaundryService, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_id' })
  service: Relation<LaundryService>;

  @Column({ name: 'service_name', type: 'varchar', length: 100 })
  serviceName: string;

  @Column({ type: 'varchar', length: 30 })
  workflow: WorkflowCode;

  @Column({ name: 'price_unit', type: 'varchar', length: 20 })
  priceUnit: PriceUnit;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice: number;

  @Column({
    name: 'weight_kg',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  weightKg: number | null;

  @Column({ name: 'garment_count', type: 'int', nullable: true })
  garmentCount: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  quantity: number;

  @Column({
    name: 'item_total',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  itemTotal: number;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  discountAmount: number;

  @Index('IDX_laundry_order_items_status')
  @Column({ type: 'varchar', length: 30 })
  status: ItemStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index('IDX_laundry_order_items_ironing_staff')
  @Column({ name: 'ironing_staff_id', type: 'uuid', nullable: true })
  ironingStaffId: string | null;

  @ManyToOne(() => LaundryStaff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ironing_staff_id' })
  ironingStaff?: Relation<LaundryStaff> | null;

  @Column({ name: 'ironing_started_at', type: 'timestamptz', nullable: true })
  ironingStartedAt: Date | null;

  @Column({ name: 'ironing_completed_at', type: 'timestamptz', nullable: true })
  ironingCompletedAt: Date | null;

  @Column({
    name: 'ironing_rate',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  ironingRate: number | null;

  @Column({
    name: 'ironing_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  ironingWage: number | null;

  @Column({ name: 'ironing_payout_id', type: 'uuid', nullable: true })
  ironingPayoutId: string | null;

  @ManyToOne(() => IroningPayout, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ironing_payout_id' })
  ironingPayout?: Relation<IroningPayout> | null;

  @Column({ name: 'ironing_paid_at', type: 'timestamptz', nullable: true })
  ironingPaidAt: Date | null;

  @Column({ name: 'rack_number', type: 'varchar', length: 20, nullable: true })
  rackNumber: string | null;

  @Column({ name: 'rack_assigned_by_staff_id', type: 'uuid', nullable: true })
  rackAssignedByStaffId: string | null;

  @Column({ name: 'rack_assigned_at', type: 'timestamptz', nullable: true })
  rackAssignedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => OrderStatusHistory, (history) => history.orderItem)
  statusHistory: Relation<OrderStatusHistory[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
