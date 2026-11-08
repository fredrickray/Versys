import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Append-only. Never UPDATE/DELETE from application code. */
@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  incidentId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  resourceType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64, nullable: true })
  correlationId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
