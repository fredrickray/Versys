import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DevicePlatform = 'ios' | 'android' | 'web';

@Entity({ name: 'device_tokens' })
export class DeviceTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 512 })
  token!: string;

  @Column({ type: 'varchar', length: 16 })
  platform!: DevicePlatform;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
