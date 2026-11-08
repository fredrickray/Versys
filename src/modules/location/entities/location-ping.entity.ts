import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Historical trail for active incidents / duty shifts.
 * Latest point for nearest-staff lives in Redis GEO; this table is the durable trail.
 */
@Entity({ name: 'location_pings' })
@Index(['userId', 'recordedAt'])
@Index(['incidentId', 'recordedAt'])
export class LocationPingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  incidentId!: string | null;

  @Column({ type: 'boolean', default: false })
  onDuty!: boolean;

  @Column({ type: 'double precision' })
  latitude!: number;

  @Column({ type: 'double precision' })
  longitude!: number;

  @Column({ type: 'double precision', nullable: true })
  accuracyMetres!: number | null;

  @Column({ type: 'timestamptz' })
  recordedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
