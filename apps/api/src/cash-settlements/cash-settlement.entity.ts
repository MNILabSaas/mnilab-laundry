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

@Entity('cash_settlements')
@Index('UQ_cash_settlements_tenant_branch_date', ['tenantId', 'branchId', 'settlementDate'], {
  unique: true,
})
export class CashSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_cash_settlements_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_cash_settlements_branch')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branch_id' })
  branch: Relation<Branch>;

  @Index('IDX_cash_settlements_date')
  @Column({ name: 'settlement_date', type: 'date' })
  settlementDate: string;

  @Column({ name: 'cashier_staff_id', type: 'uuid' })
  cashierStaffId: string;

  @ManyToOne(() => LaundryStaff, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cashier_staff_id' })
  cashier: Relation<LaundryStaff>;

  @Column({ name: 'total_cash_in', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  totalCashIn: number;

  @Column({ name: 'total_qris_in', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  totalQrisIn: number;

  @Column({ name: 'total_approved_expense', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  totalApprovedExpense: number;

  @Column({ name: 'expected_cash', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  expectedCash: number;

  @Column({ name: 'actual_cash', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  actualCash: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  difference: number;

  @Index('IDX_cash_settlements_status')
  @Column({
    type: 'varchar',
    length: 20,
    default: ExpenseApprovalStatus.PENDING,
  })
  status: ExpenseApprovalStatus;

  @Column({ name: 'cashier_notes', type: 'text', nullable: true })
  cashierNotes: string | null;

  @Column({ name: 'reviewed_by_staff_id', type: 'uuid', nullable: true })
  reviewedByStaffId: string | null;

  @ManyToOne(() => LaundryStaff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_staff_id' })
  reviewedBy?: Relation<LaundryStaff> | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
