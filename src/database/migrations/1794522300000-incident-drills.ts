import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncidentDrills1794522300000 implements MigrationInterface {
  name = 'IncidentDrills1794522300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE incidents
      ADD COLUMN is_drill boolean NOT NULL DEFAULT false,
      ADD COLUMN drill_purpose varchar(240),
      ADD COLUMN drill_actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX idx_incidents_non_drill_status ON incidents (status, created_at) WHERE is_drill = false`,
    );
    await queryRunner.query(`
      ALTER TABLE incidents
      ADD CONSTRAINT chk_incidents_drill_metadata CHECK (
        (is_drill = false AND drill_purpose IS NULL AND drill_actor_user_id IS NULL) OR
        (is_drill = true AND drill_purpose IS NOT NULL AND drill_actor_user_id IS NOT NULL)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incidents_drill_metadata`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_incidents_non_drill_status`,
    );
    await queryRunner.query(`
      ALTER TABLE incidents
      DROP COLUMN IF EXISTS drill_actor_user_id,
      DROP COLUMN IF EXISTS drill_purpose,
      DROP COLUMN IF EXISTS is_drill
    `);
  }
}
