import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AssignmentStatus, RejectionReason } from '../../../common/enums';

@Entity({ name: 'assignments' })
@Index(['incidentId', 'assigneeUserId'])
export class AssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  incidentId!: string;

  @Index()
  @Column({ type: 'uuid' })
  assigneeUserId!: string;

  @Column({ type: 'uuid', nullable: true })
  assignedByUserId!: string | null;

  @Column({ type: 'varchar', length: 32, default: AssignmentStatus.PENDING })
  status!: AssignmentStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  rejectionReason!: RejectionReason | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  rejectionNote!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
