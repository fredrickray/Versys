import { MigrationInterface, QueryRunner } from 'typeorm';

export class EscalationDurability1794522400000 implements MigrationInterface {
  name = 'EscalationDurability1794522400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE incidents
      ADD COLUMN escalation_generation integer NOT NULL DEFAULT 0,
      ADD COLUMN escalation_hold_at timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE assignments
      ADD COLUMN generation integer NOT NULL DEFAULT 0,
      ADD COLUMN withdrawn_at timestamptz
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_assignments_incident_assignee
      ON assignments (incident_id, assignee_user_id)
    `);
    await queryRunner.query(`
      CREATE TABLE escalation_deadlines (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
        generation integer NOT NULL,
        kind varchar(16) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending',
        due_at timestamptz NOT NULL,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_escalation_deadline UNIQUE (incident_id, generation, kind),
        CONSTRAINT chk_escalation_deadline_kind CHECK (kind IN ('prompt', 'auto')),
        CONSTRAINT chk_escalation_deadline_status CHECK (
          status IN ('pending', 'completed', 'cancelled', 'frozen')
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_escalation_deadlines_due
      ON escalation_deadlines (due_at)
      WHERE status = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS escalation_deadlines`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_assignments_incident_assignee`,
    );
    await queryRunner.query(`
      ALTER TABLE assignments
      DROP COLUMN IF EXISTS withdrawn_at,
      DROP COLUMN IF EXISTS generation
    `);
    await queryRunner.query(`
      ALTER TABLE incidents
      DROP COLUMN IF EXISTS escalation_hold_at,
      DROP COLUMN IF EXISTS escalation_generation
    `);
  }
}
