import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type StaffShiftStatus = 'active' | 'ended' | 'expired';

@Entity({ name: 'staff_shifts' })
export class StaffShiftEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: StaffShiftStatus;

  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
