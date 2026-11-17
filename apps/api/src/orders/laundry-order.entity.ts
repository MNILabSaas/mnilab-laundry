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
import { Branch } from '../branches/branch.entity.js';
import { OrderPaymentStatus } from '../common/enums.js';
import { numericTransformer } from '../common/utils/numeric.transformer.js';
import { Customer } from '../customers/customer.entity.js';
import { Payment } from '../payments/payment.entity.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { LaundryOrderItem } from './laundry-order-item.entity.js';

const money = {
  type: 'numeric' as const,
  precision: 12,
  scale: 2,
  transformer: numericTransformer,
};

@Entity('laundry_orders')
@Index('UQ_laundry_orders_tenant_number', ['tenantId', 'orderNumber'], { unique: true })
@Check('CHK_laundry_orders_amounts', `"subtotal" >= 0 AND "discount" >= 0 AND "discount" <= "subtotal"`)
@Check('CHK_laundry_orders_total', `"total" = "subtotal" - "discount" + "pay_later_fee"`)
@Check('CHK_laundry_orders_paid', `"paid_amount" >= 0 AND "paid_amount" <= "total"`)
export class LaundryOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_laundry_orders_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'order_number', type: 'varchar', length: 30 })
  orderNumber: string;

  @Index('IDX_laundry_orders_branch')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branch_id' })
  branch: Relation<Branch>;

  @Index('IDX_laundry_orders_customer')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer: Relation<Customer>;

  @Column({ name: 'cashier_staff_id', type: 'uuid' })
  cashierStaffId: string;

  @ManyToOne(() => LaundryStaff, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cashier_staff_id' })
  cashier: Relation<LaundryStaff>;

  @Index('IDX_laundry_orders_received_at')
  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;

  @Column({ name: 'estimated_completion_at', type: 'timestamptz', nullable: true })
  estimatedCompletionAt: Date | null;

  @Column(money)
  subtotal: number;

  @Column({ ...money, default: 0 })
  discount: number;

  @Column({ name: 'is_pay_later', type: 'boolean', default: false })
  isPayLater: boolean;

  @Column({ ...money, name: 'pay_later_fee', default: 0 })
  payLaterFee: number;

  @Column(money)
  total: number;

  @Column({ ...money, name: 'paid_amount', default: 0 })
  paidAmount: number;

  @Index('IDX_laundry_orders_payment_status')
  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 20,
    default: OrderPaymentStatus.UNPAID,
  })
  paymentStatus: OrderPaymentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true })
  pickedUpAt: Date | null;

  @Column({ name: 'picked_up_by_staff_id', type: 'uuid', nullable: true })
  pickedUpByStaffId: string | null;

  @ManyToOne(() => LaundryStaff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'picked_up_by_staff_id' })
  pickedUpBy?: Relation<LaundryStaff> | null;

  @OneToMany(() => LaundryOrderItem, (item) => item.order)
  items: Relation<LaundryOrderItem[]>;

  @OneToMany(() => Payment, (payment) => payment.order)
  payments: Relation<Payment[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
