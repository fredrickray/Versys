import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeviceTokens1731080000000 implements MigrationInterface {
  name = 'DeviceTokens1731080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE device_tokens (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token varchar(512) NOT NULL UNIQUE,
        platform varchar(16) NOT NULL,
        last_seen_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_device_tokens_user_id ON device_tokens (user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS device_tokens`);
  }
}
