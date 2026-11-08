import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AlertLevel } from '../../../common/enums';

@Entity({ name: 'escalation_events' })
export class EscalationEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  incidentId!: string;

  @Column({ type: 'varchar', length: 40 })
  action!: string;

  @Column({ type: 'smallint', nullable: true })
  fromLevel!: AlertLevel | null;

  @Column({ type: 'smallint', nullable: true })
  toLevel!: AlertLevel | null;

  @Column({ type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
