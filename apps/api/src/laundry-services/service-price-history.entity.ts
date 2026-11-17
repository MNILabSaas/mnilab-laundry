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
import { numericTransformer } from '../common/utils/numeric.transformer.js';
import { LaundryService } from './laundry-service.entity.js';

@Entity('service_price_history')
export class ServicePriceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_service_price_history_tenant')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index('IDX_service_price_history_service')
  @Column({ name: 'service_id', type: 'uuid' })
  serviceId: string;

  @ManyToOne(() => LaundryService, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service: Relation<LaundryService>;

  @Column({
    name: 'old_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  oldPrice: number;

  @Column({
    name: 'new_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  newPrice: number;

  @Column({ name: 'changed_by_staff_id', type: 'uuid', nullable: true })
  changedByStaffId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
