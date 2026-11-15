import { MigrationInterface, QueryRunner } from 'typeorm';

export class LocationShiftsPostgis1794522600000 implements MigrationInterface {
  name = 'LocationShiftsPostgis1794522600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE staff_shifts (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'active',
        started_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        ended_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_staff_shift_status
          CHECK (status IN ('active', 'ended', 'expired'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_staff_shifts_active_user
      ON staff_shifts (user_id)
      WHERE status = 'active'
    `);
    await queryRunner.query(`
      CREATE INDEX idx_staff_shifts_expiry
      ON staff_shifts (expires_at)
      WHERE status = 'active'
    `);
    await queryRunner.query(`
      ALTER TABLE location_pings
      ADD COLUMN shift_id uuid REFERENCES staff_shifts(id) ON DELETE SET NULL,
      ADD COLUMN assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
      ADD COLUMN position geography(Point, 4326)
        GENERATED ALWAYS AS (
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        ) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX idx_location_pings_position
      ON location_pings USING GIST (position)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_location_pings_created_at
      ON location_pings (created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_location_pings_created_at`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_location_pings_position`);
    await queryRunner.query(`
      ALTER TABLE location_pings
      DROP COLUMN IF EXISTS position,
      DROP COLUMN IF EXISTS assignment_id,
      DROP COLUMN IF EXISTS shift_id
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS staff_shifts`);
  }
}
