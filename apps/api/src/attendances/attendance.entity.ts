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
import { numericTransformer } from '../common/utils/numeric.transformer.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';

@Entity('attendances')
@Index('UQ_attendances_tenant_staff_date', ['tenantId', 'staffId', 'attendanceDate'], {
  unique: true,
})
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_attendances_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_attendances_branch')
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch: Relation<Branch>;

  @Index('IDX_attendances_staff')
  @Column({ name: 'staff_id', type: 'uuid' })
  staffId: string;

  @ManyToOne(() => LaundryStaff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff: Relation<LaundryStaff>;

  @Column({ name: 'recorded_by_staff_id', type: 'uuid', nullable: true })
  recordedByStaffId: string | null;

  @Index('IDX_attendances_date')
  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'check_in_at', type: 'timestamptz', default: () => 'now()' })
  checkInAt: Date;

  @Column({ name: 'check_out_at', type: 'timestamptz', nullable: true })
  checkOutAt: Date | null;

  @Column({ name: 'check_in_lat', type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: numericTransformer })
  checkInLat: number | null;

  @Column({ name: 'check_in_lng', type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: numericTransformer })
  checkInLng: number | null;

  @Column({ name: 'check_in_distance_meters', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  checkInDistanceMeters: number | null;

  @Column({ name: 'check_out_lat', type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: numericTransformer })
  checkOutLat: number | null;

  @Column({ name: 'check_out_lng', type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: numericTransformer })
  checkOutLng: number | null;

  @Column({ name: 'check_out_distance_meters', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  checkOutDistanceMeters: number | null;

  @Column({ name: 'face_distance', type: 'numeric', precision: 8, scale: 4, nullable: true, transformer: numericTransformer })
  faceDistance: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
