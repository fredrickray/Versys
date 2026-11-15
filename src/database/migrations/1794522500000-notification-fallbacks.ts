import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationFallbacks1794522500000 implements MigrationInterface {
  name = 'NotificationFallbacks1794522500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notification_fallbacks (
        attempt_id uuid PRIMARY KEY REFERENCES notification_attempts(id) ON DELETE CASCADE,
        event_key varchar(180) NOT NULL UNIQUE,
        status varchar(16) NOT NULL DEFAULT 'pending',
        due_at timestamptz NOT NULL,
        next_attempt_at timestamptz NOT NULL,
        attempt_count integer NOT NULL DEFAULT 0,
        last_error varchar(512),
        provider_message_id varchar(180),
        sent_at timestamptz,
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_notification_fallback_status
          CHECK (status IN ('pending', 'sent', 'cancelled', 'dead'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notification_fallbacks_due
      ON notification_fallbacks (next_attempt_at)
      WHERE status = 'pending'
    `);
    await queryRunner.query(`
      INSERT INTO notification_fallbacks (
        attempt_id,
        event_key,
        status,
        due_at,
        next_attempt_at,
        cancelled_at
      )
      SELECT
        id,
        'notification.sms-fallback.' || id,
        CASE WHEN acked_at IS NULL THEN 'pending' ELSE 'cancelled' END,
        now(),
        now(),
        acked_at
      FROM notification_attempts
      WHERE template_key = 'incident_alert'
        AND status IN ('sent', 'acked')
        AND created_at >= now() - interval '15 minutes'
      ON CONFLICT (attempt_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notification_fallbacks`);
  }
}
