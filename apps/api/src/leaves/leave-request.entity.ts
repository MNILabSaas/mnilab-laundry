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
import { ExpenseApprovalStatus, LeaveType } from '../common/enums.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';

@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_leave_requests_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_leave_requests_branch')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch: Relation<Branch>;

  @Index('IDX_leave_requests_staff')
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId: string;

  @ManyToOne(() => LaundryStaff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff: Relation<LaundryStaff>;

  @Column({ name: 'leave_type', type: 'varchar', length: 30, default: LeaveType.CUTI })
  leaveType: LeaveType;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'total_days', type: 'int', default: 1 })
  totalDays: number;

  @Column({ type: 'text' })
  reason: string;

  @Index('IDX_leave_requests_status')
  @Column({ type: 'varchar', length: 20, default: ExpenseApprovalStatus.PENDING })
  status: ExpenseApprovalStatus;

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
