import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type NotificationFallbackStatus =
  'pending' | 'sent' | 'cancelled' | 'dead';

@Entity({ name: 'notification_fallbacks' })
export class NotificationFallbackEntity {
  @PrimaryColumn({ type: 'uuid' })
  attemptId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180 })
  eventKey!: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: NotificationFallbackStatus;

  @Column({ type: 'timestamptz' })
  dueAt!: Date;

  @Index()
  @Column({ type: 'timestamptz' })
  nextAttemptAt!: Date;

  @Column({ type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  lastError!: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  providerMessageId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
