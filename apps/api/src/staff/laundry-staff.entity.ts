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
import { UserRole } from '../common/enums.js';

/**
 * Profil pegawai/owner di dalam produk Laundry (terhubung logis ke platform_users.id di mnilab_main).
 */
@Entity('laundry_staff')
@Index('UQ_laundry_staff_tenant_platform_user', ['tenantId', 'platformUserId'], {
  unique: true,
})
@Check('CHK_laundry_staff_contact', `"email" IS NOT NULL OR "phone" IS NOT NULL`)
export class LaundryStaff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_laundry_staff_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'platform_user_id', type: 'uuid' })
  platformUserId: string;

  @Index('IDX_laundry_staff_branch')
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch?: Relation<Branch> | null;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Index('IDX_laundry_staff_role')
  @Column({ type: 'varchar', length: 30 })
  role: UserRole;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'face_descriptor', type: 'text', nullable: true })
  faceDescriptor: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
