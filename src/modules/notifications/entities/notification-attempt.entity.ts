import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotificationChannel } from '../../../common/enums';

@Entity({ name: 'notification_attempts' })
export class NotificationAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  incidentId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  channel!: NotificationChannel;

  @Column({ type: 'varchar', length: 64 })
  templateKey!: string;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status!: 'pending' | 'sent' | 'acked' | 'failed' | 'fallback_sms';

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  ackedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
