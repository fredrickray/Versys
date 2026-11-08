import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StaffCategory } from '../../../common/enums';

@Entity({ name: 'roles' })
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'varchar', length: 120 })
  label!: string;

  @Column({ type: 'smallint', nullable: true })
  staffCategory!: StaffCategory | null;

  @Column({ type: 'text', array: true, default: '{}' })
  permissions!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
