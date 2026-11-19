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
import type { TenantBankAccountItem } from '../tenant-context/tenant-profile.entity.js';

@Entity('qris_withdrawals')
export class QrisWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_qris_withdrawals_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_qris_withdrawals_branch')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch: Relation<Branch>;

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

  @Column({ name: 'total_transactions', type: 'int', default: 0 })
  totalTransactions: number;

  @Index('IDX_qris_withdrawals_status')
  @Column({
    type: 'varchar',
    length: 20,
    default: ExpenseApprovalStatus.PENDING,
  })
  status: ExpenseApprovalStatus;

  @Column({ name: 'requested_by_staff_id', type: 'uuid', nullable: true })
  requestedByStaffId: string | null;

  @Column({ name: 'requested_by_name', type: 'varchar', length: 120, nullable: true })
  requestedByName: string | null;

  @Column({ name: 'owner_notes', type: 'text', nullable: true })
  ownerNotes: string | null;

  @Column({ name: 'target_bank_account_json', type: 'jsonb', nullable: true })
  targetBankAccountJson: TenantBankAccountItem | null;

  @Column({ name: 'transfer_proof', type: 'text', nullable: true })
  transferProof: string | null;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'reviewed_by_email', type: 'varchar', length: 150, nullable: true })
  reviewedByEmail: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'gateway_meta_json', type: 'jsonb', nullable: true })
  gatewayMetaJson: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
