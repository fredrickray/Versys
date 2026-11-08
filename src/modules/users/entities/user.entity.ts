import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StaffCategory, UserCategory } from '../../../common/enums';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  phoneE164!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  fullName!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  staffRoleKey!: string | null;

  @Column({ type: 'smallint', nullable: true })
  staffCategory!: StaffCategory | null;

  @Column({ type: 'varchar', length: 64, default: UserCategory.GENERAL })
  userCategory!: UserCategory;

  @Column({ type: 'boolean', default: false })
  isDispatcher!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
