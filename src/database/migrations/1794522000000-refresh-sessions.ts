import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshSessions1794522000000 implements MigrationInterface {
  name = 'RefreshSessions1794522000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE refresh_sessions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        current_token_hash char(64) NOT NULL UNIQUE,
        device_id varchar(128) NOT NULL,
        expires_at timestamptz NOT NULL,
        last_rotated_at timestamptz,
        revoked_at timestamptz,
        revoked_reason varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_refresh_sessions_user_id ON refresh_sessions (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_refresh_sessions_expires_at ON refresh_sessions (expires_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_refresh_sessions_active_user ON refresh_sessions (user_id) WHERE revoked_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_sessions`);
  }
}
