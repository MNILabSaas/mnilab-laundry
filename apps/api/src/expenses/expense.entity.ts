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
import { ExpenseApprovalStatus, PaymentMethod } from '../common/enums.js';
import { numericTransformer } from '../common/utils/numeric.transformer.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { ExpenseCategory } from './expense-category.entity.js';

@Entity('expenses')
@Check('CHK_expenses_amount', `"amount" > 0`)
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_expenses_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_expenses_branch')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branch_id' })
  branch: Relation<Branch>;

  @Index('IDX_expenses_category')
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => ExpenseCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: Relation<ExpenseCategory>;

  @Column({ name: 'recorded_by_staff_id', type: 'uuid' })
  recordedByStaffId: string;

  @ManyToOne(() => LaundryStaff, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recorded_by_staff_id' })
  recordedBy: Relation<LaundryStaff>;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Index('IDX_expenses_expense_date')
  @Column({ name: 'expense_date', type: 'date' })
  expenseDate: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod: PaymentMethod;

  @Column({ name: 'receipt_url', type: 'text', nullable: true })
  receiptUrl: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index('IDX_expenses_approval_status')
  @Column({
    name: 'approval_status',
    type: 'varchar',
    length: 20,
    default: ExpenseApprovalStatus.PENDING,
  })
  approvalStatus: ExpenseApprovalStatus;

  @Column({ name: 'approved_by_staff_id', type: 'uuid', nullable: true })
  approvedByStaffId: string | null;

  @ManyToOne(() => LaundryStaff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by_staff_id' })
  approvedBy?: Relation<LaundryStaff> | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approval_notes', type: 'text', nullable: true })
  approvalNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
