import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RealtimeEventType =
  | 'incident.created'
  | 'incident.updated'
  | 'assignment.accepted'
  | 'assignment.rejected'
  | 'authz.changed';

@Entity({ name: 'realtime_outbox' })
export class RealtimeOutboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180 })
  eventKey!: string;

  @Column({ type: 'varchar', length: 48 })
  type!: RealtimeEventType;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  incidentId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  availableAt!: Date;

  @Column({ type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ type: 'varchar', length: 256, nullable: true })
  lastError!: string | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
