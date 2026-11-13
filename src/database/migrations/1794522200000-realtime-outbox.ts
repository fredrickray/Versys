import { MigrationInterface, QueryRunner } from 'typeorm';

export class RealtimeOutbox1794522200000 implements MigrationInterface {
  name = 'RealtimeOutbox1794522200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE realtime_outbox (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_key varchar(180) NOT NULL UNIQUE,
        type varchar(48) NOT NULL,
        incident_id uuid REFERENCES incidents(id) ON DELETE CASCADE,
        payload jsonb NOT NULL DEFAULT '{}',
        occurred_at timestamptz NOT NULL,
        available_at timestamptz NOT NULL DEFAULT now(),
        attempt_count integer NOT NULL DEFAULT 0,
        last_error varchar(256),
        published_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_realtime_outbox_type CHECK (
          type IN (
            'incident.created',
            'incident.updated',
            'assignment.accepted',
            'assignment.rejected',
            'authz.changed'
          )
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_realtime_outbox_pending ON realtime_outbox (available_at, created_at) WHERE published_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_realtime_outbox_incident_id ON realtime_outbox (incident_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS realtime_outbox`);
  }
}
