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
import { PaymentMethod, PaymentStatus } from '../common/enums.js';
import { numericTransformer } from '../common/utils/numeric.transformer.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';

@Entity('payments')
@Check('CHK_payments_amount', `"amount" > 0`)
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_payments_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_payments_order')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => LaundryOrder, (order) => order.payments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Relation<LaundryOrder>;

  @Index('IDX_payments_branch')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branch_id' })
  branch: Relation<Branch>;

  @Column({ name: 'cashier_staff_id', type: 'uuid' })
  cashierStaffId: string;

  @ManyToOne(() => LaundryStaff, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cashier_staff_id' })
  cashier: Relation<LaundryStaff>;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  @Index('IDX_payments_status')
  @Column({ type: 'varchar', length: 20, default: PaymentStatus.SUCCESS })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', default: () => 'now()' })
  paidAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
