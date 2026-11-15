import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EscalationDeadlineKind = 'prompt' | 'auto';
export type EscalationDeadlineStatus =
  'pending' | 'completed' | 'cancelled' | 'frozen';

@Entity({ name: 'escalation_deadlines' })
@Index(['incidentId', 'generation', 'kind'], { unique: true })
export class EscalationDeadlineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  incidentId!: string;

  @Column({ type: 'uuid', nullable: true })
  assignmentId!: string | null;

  @Column({ type: 'integer' })
  generation!: number;

  @Column({ type: 'varchar', length: 16 })
  kind!: EscalationDeadlineKind;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: EscalationDeadlineStatus;

  @Index()
  @Column({ type: 'timestamptz' })
  dueAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
