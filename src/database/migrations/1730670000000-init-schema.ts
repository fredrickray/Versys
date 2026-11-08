import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema + PostGIS. Coordinates stored as lat/lng doubles for app simplicity;
 * GEO queries in Redis for live nearest-staff. PostGIS reserved for later spatial joins.
 */
export class InitSchema1730670000000 implements MigrationInterface {
  name = 'InitSchema1730670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        phone_e164 varchar(32) NOT NULL UNIQUE,
        full_name varchar(120),
        staff_role_key varchar(64),
        staff_category smallint,
        user_category varchar(64) NOT NULL DEFAULT 'general',
        is_dispatcher boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        last_seen_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE roles (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        key varchar(64) NOT NULL UNIQUE,
        label varchar(120) NOT NULL,
        staff_category smallint,
        permissions text[] NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE places (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        code varchar(64) NOT NULL UNIQUE,
        name varchar(120) NOT NULL,
        group_key varchar(64) NOT NULL,
        ussd_number int NOT NULL,
        latitude double precision,
        longitude double precision,
        is_muster_point boolean NOT NULL DEFAULT false,
        is_blocked boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE external_contacts (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        key varchar(64) NOT NULL UNIQUE,
        agency_name varchar(120) NOT NULL,
        phone_e164 varchar(32) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE incidents (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        public_code varchar(16) NOT NULL UNIQUE,
        type varchar(32) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'reported',
        alert_level smallint NOT NULL,
        channel varchar(32) NOT NULL,
        reporter_user_id uuid,
        reporter_phone_e164 varchar(32),
        location_label varchar(120),
        place_id uuid,
        latitude double precision,
        longitude double precision,
        prompt_issued_at timestamptz,
        first_accepted_at timestamptz,
        resolved_at timestamptz,
        resolved_by_user_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_incidents_status ON incidents(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_incidents_created ON incidents(created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE assignments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        incident_id uuid NOT NULL,
        assignee_user_id uuid NOT NULL,
        assigned_by_user_id uuid,
        status varchar(32) NOT NULL DEFAULT 'pending',
        rejection_reason varchar(32),
        rejection_note varchar(240),
        accepted_at timestamptz,
        rejected_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_assignments_incident_assignee ON assignments(incident_id, assignee_user_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE escalation_events (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        incident_id uuid NOT NULL,
        action varchar(40) NOT NULL,
        from_level smallint,
        to_level smallint,
        actor_user_id uuid,
        payload jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_escalation_incident ON escalation_events(incident_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        action varchar(64) NOT NULL,
        actor_user_id uuid,
        incident_id uuid,
        resource_type varchar(64),
        resource_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}',
        correlation_id varchar(64),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_audit_action ON audit_logs(action)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_audit_incident ON audit_logs(incident_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE location_pings (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL,
        incident_id uuid,
        on_duty boolean NOT NULL DEFAULT false,
        latitude double precision NOT NULL,
        longitude double precision NOT NULL,
        accuracy_metres double precision,
        recorded_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_location_user_time ON location_pings(user_id, recorded_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_location_incident_time ON location_pings(incident_id, recorded_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE notification_attempts (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL,
        incident_id uuid,
        channel varchar(16) NOT NULL,
        template_key varchar(64) NOT NULL,
        status varchar(24) NOT NULL DEFAULT 'pending',
        payload jsonb NOT NULL DEFAULT '{}',
        acked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE announcements (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        author_user_id uuid NOT NULL,
        title varchar(160) NOT NULL,
        body text NOT NULL,
        target_categories text[] NOT NULL DEFAULT '{}',
        published_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_logs_no_update
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS announcements`);
    await queryRunner.query(`DROP TABLE IF EXISTS notification_attempts`);
    await queryRunner.query(`DROP TABLE IF EXISTS location_pings`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_audit_mutation`);
    await queryRunner.query(`DROP TABLE IF EXISTS escalation_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS incidents`);
    await queryRunner.query(`DROP TABLE IF EXISTS external_contacts`);
    await queryRunner.query(`DROP TABLE IF EXISTS places`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
