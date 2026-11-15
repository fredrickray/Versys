import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationIntents1794522700000 implements MigrationInterface {
  name = 'NotificationIntents1794522700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notification_attempts
      ADD COLUMN intent_key varchar(220)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_notification_attempts_intent_key
      ON notification_attempts (intent_key)
      WHERE intent_key IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE notification_intents (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_key varchar(180) NOT NULL UNIQUE,
        incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        kind varchar(24) NOT NULL,
        user_ids jsonb NOT NULL DEFAULT '[]',
        payload jsonb NOT NULL DEFAULT '{}',
        status varchar(16) NOT NULL DEFAULT 'pending',
        lease_owner varchar(36),
        lease_expires_at timestamptz,
        attempt_count integer NOT NULL DEFAULT 0,
        last_error varchar(512),
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_notification_intent_kind
          CHECK (kind IN ('incident_initial', 'level', 'prompt')),
        CONSTRAINT chk_notification_intent_status
          CHECK (status IN ('pending', 'processing', 'completed'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notification_intents_pending
      ON notification_intents (created_at)
      WHERE status != 'completed'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_intents`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_notification_attempts_intent_key`,
    );
    await queryRunner.query(`
      ALTER TABLE notification_attempts
      DROP COLUMN IF EXISTS intent_key
    `);
  }
}
