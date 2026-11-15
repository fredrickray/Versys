import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { DataSource, type MigrationInterface } from 'typeorm';
import { InitSchema1730670000000 } from '../../src/database/migrations/1730670000000-init-schema';
import { DeviceTokens1731080000000 } from '../../src/database/migrations/1731080000000-device-tokens';
import { RefreshSessions1794522000000 } from '../../src/database/migrations/1794522000000-refresh-sessions';
import { InboundIdempotency1794522100000 } from '../../src/database/migrations/1794522100000-inbound-idempotency';
import { RealtimeOutbox1794522200000 } from '../../src/database/migrations/1794522200000-realtime-outbox';
import { IncidentDrills1794522300000 } from '../../src/database/migrations/1794522300000-incident-drills';
import { EscalationDurability1794522400000 } from '../../src/database/migrations/1794522400000-escalation-durability';
import { NotificationFallbacks1794522500000 } from '../../src/database/migrations/1794522500000-notification-fallbacks';
import { LocationShiftsPostgis1794522600000 } from '../../src/database/migrations/1794522600000-location-shifts-postgis';
import { NotificationIntents1794522700000 } from '../../src/database/migrations/1794522700000-notification-intents';

const historicalMigrations = [
  InitSchema1730670000000,
  DeviceTokens1731080000000,
];
const allMigrations = [
  ...historicalMigrations,
  RefreshSessions1794522000000,
  InboundIdempotency1794522100000,
  RealtimeOutbox1794522200000,
  IncidentDrills1794522300000,
  EscalationDurability1794522400000,
  NotificationFallbacks1794522500000,
  LocationShiftsPostgis1794522600000,
  NotificationIntents1794522700000,
];

describe('database migration upgrade', () => {
  const baseDatabase = process.env.DATABASE_NAME ?? 'versys';
  const database = `${baseDatabase}_migration_${process.pid}`;
  let admin: Pool;
  let dataSource: DataSource | undefined;

  beforeAll(async () => {
    admin = new Pool({
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: 'postgres',
    });
    await admin.query(`CREATE DATABASE "${database}"`);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
      [database],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  });

  it('preserves historical data, applies latest, reverts, and reapplies', async () => {
    dataSource = source(historicalMigrations);
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'all' });

    const userId = randomUUID();
    const incidentId = randomUUID();
    await dataSource.query(
      `INSERT INTO users (id, phone_e164) VALUES ($1, $2)`,
      [userId, `+234817${String(Date.now()).slice(-7)}`],
    );
    await dataSource.query(
      `
        INSERT INTO incidents (
          id,
          public_code,
          type,
          status,
          alert_level,
          channel,
          reporter_user_id
        ) VALUES ($1, $2, 'fight', 'reported', 1, 'app_button', $3)
      `,
      [incidentId, `MIG-${String(Date.now()).slice(-8)}`, userId],
    );
    await dataSource.destroy();

    dataSource = source(allMigrations);
    await dataSource.initialize();
    await dataSource.runMigrations({ transaction: 'all' });

    const upgraded = await dataSource.query<
      { id: string; is_drill: boolean; escalation_generation: number }[]
    >(
      `SELECT id, is_drill, escalation_generation FROM incidents WHERE id = $1`,
      [incidentId],
    );
    expect(upgraded).toEqual([
      { id: incidentId, is_drill: false, escalation_generation: 0 },
    ]);
    expect(await tableExists('refresh_sessions')).toBe(true);
    expect(await tableExists('inbound_requests')).toBe(true);
    expect(await tableExists('realtime_outbox')).toBe(true);
    expect(await tableExists('escalation_deadlines')).toBe(true);
    expect(await tableExists('notification_fallbacks')).toBe(true);
    expect(await tableExists('staff_shifts')).toBe(true);
    expect(await tableExists('notification_intents')).toBe(true);

    await dataSource.undoLastMigration({ transaction: 'all' });
    expect(await tableExists('notification_intents')).toBe(false);
    expect(
      await dataSource.query(`SELECT id FROM incidents WHERE id = $1`, [
        incidentId,
      ]),
    ).toHaveLength(1);

    await dataSource.runMigrations({ transaction: 'all' });
    expect(await tableExists('notification_intents')).toBe(true);
    expect(await dataSource.showMigrations()).toBe(false);
  }, 120_000);

  function source(migrations: Array<new () => MigrationInterface>): DataSource {
    return new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database,
      entities: [],
      migrations,
      migrationsTableName: 'migrations',
      synchronize: false,
    });
  }

  async function tableExists(table: string): Promise<boolean> {
    const rows = await dataSource!.query<{ exists: boolean }[]>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [`public.${table}`],
    );
    return rows[0].exists;
  }
});
