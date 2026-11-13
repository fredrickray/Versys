import { MigrationInterface, QueryRunner } from 'typeorm';

export class InboundIdempotency1794522100000 implements MigrationInterface {
  name = 'InboundIdempotency1794522100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE inbound_requests (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        source varchar(32) NOT NULL,
        provider_key varchar(160) NOT NULL,
        request_hash char(64) NOT NULL,
        request_payload jsonb NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'processing',
        lease_owner varchar(36),
        lease_expires_at timestamptz,
        attempt_count integer NOT NULL DEFAULT 1,
        incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
        response_status smallint,
        response_body jsonb,
        completed_at timestamptz,
        last_error varchar(256),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_inbound_requests_source_provider_key
          UNIQUE (source, provider_key),
        CONSTRAINT chk_inbound_requests_status
          CHECK (status IN ('processing', 'completed')),
        CONSTRAINT chk_inbound_requests_completed_response
          CHECK (
            status <> 'completed' OR
            (response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
          )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_inbound_requests_processing_lease ON inbound_requests (lease_expires_at) WHERE status = 'processing'`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_inbound_requests_incident_id ON inbound_requests (incident_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS inbound_requests`);
  }
}
