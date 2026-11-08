import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AlertLevel,
  IncidentChannel,
  IncidentStatus,
  IncidentType,
} from '../../../common/enums';

@Entity({ name: 'incidents' })
export class IncidentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Human-facing short code shown in SMS/USSD confirmations */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  publicCode!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: IncidentType;

  @Column({ type: 'varchar', length: 32, default: IncidentStatus.REPORTED })
  status!: IncidentStatus;

  @Column({ type: 'smallint' })
  alertLevel!: AlertLevel;

  @Column({ type: 'varchar', length: 32 })
  channel!: IncidentChannel;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  reporterUserId!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  reporterPhoneE164!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  locationLabel!: string | null;

  @Column({ type: 'uuid', nullable: true })
  placeId!: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  promptIssuedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  firstAcceptedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedByUserId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
