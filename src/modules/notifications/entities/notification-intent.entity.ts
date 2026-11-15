import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type NotificationIntentKind = 'incident_initial' | 'level' | 'prompt';
export type NotificationIntentStatus = 'pending' | 'processing' | 'completed';

@Entity({ name: 'notification_intents' })
export class NotificationIntentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180 })
  eventKey!: string;

  @Index()
  @Column({ type: 'uuid' })
  incidentId!: string;

  @Column({ type: 'varchar', length: 24 })
  kind!: NotificationIntentKind;

  @Column({ type: 'jsonb', default: [] })
  userIds!: string[];

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: NotificationIntentStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  leaseOwner!: string | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  lastError!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
