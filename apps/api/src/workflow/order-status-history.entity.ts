import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ItemStatus } from '../common/enums.js';
import { LaundryOrderItem } from '../orders/laundry-order-item.entity.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';

@Entity('order_status_history')
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_order_status_history_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_order_status_history_item')
  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId: string;

  @ManyToOne(() => LaundryOrderItem, (item) => item.statusHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: Relation<LaundryOrderItem>;

  @Column({ name: 'from_status', type: 'varchar', length: 30, nullable: true })
  fromStatus: ItemStatus | null;

  @Column({ name: 'to_status', type: 'varchar', length: 30 })
  toStatus: ItemStatus;

  @Column({ name: 'changed_by_staff_id', type: 'uuid', nullable: true })
  changedByStaffId: string | null;

  @ManyToOne(() => LaundryStaff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'changed_by_staff_id' })
  changedBy?: Relation<LaundryStaff> | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
