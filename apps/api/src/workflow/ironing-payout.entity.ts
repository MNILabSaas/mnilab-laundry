import {
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
import { ExpenseApprovalStatus } from '../common/enums.js';
import { numericTransformer } from '../common/utils/numeric.transformer.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';

@Entity('ironing_payouts')
export class IroningPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_ironing_payouts_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_ironing_payouts_branch')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch: Relation<Branch>;

  @Index('IDX_ironing_payouts_staff')
  @Column({ name: 'employee_staff_id', type: 'uuid' })
  employeeStaffId: string;

  @ManyToOne(() => LaundryStaff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_staff_id' })
  employee: Relation<LaundryStaff>;

  @Column({ name: 'period_month', type: 'int' })
  periodMonth: number;

  @Column({ name: 'period_year', type: 'int' })
  periodYear: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  @Column({ name: 'total_items', type: 'int', default: 0 })
  totalItems: number;

  @Index('IDX_ironing_payouts_status')
  @Column({
    type: 'varchar',
    length: 20,
    default: ExpenseApprovalStatus.PENDING,
  })
  status: ExpenseApprovalStatus;

  @Column({ name: 'employee_notes', type: 'text', nullable: true })
  employeeNotes: string | null;

  @Column({ name: 'transfer_proof', type: 'text', nullable: true })
  transferProof: string | null;

  @Column({ name: 'payment_notes', type: 'text', nullable: true })
  paymentNotes: string | null;

  @Column({ name: 'paid_by_staff_id', type: 'uuid', nullable: true })
  paidByStaffId: string | null;

  @ManyToOne(() => LaundryStaff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paid_by_staff_id' })
  paidBy?: Relation<LaundryStaff> | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'rejected_by_staff_id', type: 'uuid', nullable: true })
  rejectedByStaffId: string | null;

  @ManyToOne(() => LaundryStaff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rejected_by_staff_id' })
  rejectedBy?: Relation<LaundryStaff> | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
