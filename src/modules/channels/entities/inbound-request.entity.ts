import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InboundRequestStatus = 'processing' | 'completed';

@Entity({ name: 'inbound_requests' })
@Index(['source', 'providerKey'], { unique: true })
export class InboundRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  source!: string;

  @Column({ type: 'varchar', length: 160 })
  providerKey!: string;

  @Column({ type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'jsonb' })
  requestPayload!: Record<string, unknown>;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'processing' })
  status!: InboundRequestStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  leaseOwner!: string | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ type: 'integer', default: 1 })
  attemptCount!: number;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  incidentId!: string | null;

  @Column({ type: 'smallint', nullable: true })
  responseStatus!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  responseBody!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
