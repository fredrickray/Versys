export type PostgresConnection = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  url: string;
};

export type RedisConnection = {
  host: string;
  port: number;
  password?: string;
  db: number;
  url: string;
};

/**
 * Prefer DATABASE_URL (e.g. postgres://user:pass@host:5432/db?sslmode=require).
 * Falls back to discrete DATABASE_* fields when URL is empty.
 */
export function resolvePostgresConnection(env: {
  DATABASE_URL?: string;
  DATABASE_HOST?: string;
  DATABASE_PORT?: number | string;
  DATABASE_USER?: string;
  DATABASE_PASSWORD?: string;
  DATABASE_NAME?: string;
  DATABASE_SSL?: boolean | string;
}): PostgresConnection {
  const raw = (env.DATABASE_URL ?? '').trim();
  if (raw) {
    const u = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(u.protocol)) {
      throw new Error('DATABASE_URL must use postgres:// or postgresql://');
    }
    const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (!database) {
      throw new Error('DATABASE_URL must include a database name path');
    }
    const sslMode = (u.searchParams.get('sslmode') ?? '').toLowerCase();
    const sslFlag = String(env.DATABASE_SSL ?? '').toLowerCase();
    const ssl =
      sslMode === 'require' ||
      sslMode === 'verify-ca' ||
      sslMode === 'verify-full' ||
      sslFlag === 'true' ||
      u.searchParams.get('ssl') === 'true';

    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database,
      ssl,
      url: raw,
    };
  }

  const host = env.DATABASE_HOST?.trim();
  const username = env.DATABASE_USER?.trim();
  const password = env.DATABASE_PASSWORD ?? '';
  const database = env.DATABASE_NAME?.trim();
  if (!host || !username || !database) {
    throw new Error(
      'Set DATABASE_URL or DATABASE_HOST + DATABASE_USER + DATABASE_NAME',
    );
  }
  const port = Number(env.DATABASE_PORT ?? 5432);
  const ssl =
    String(env.DATABASE_SSL ?? '').toLowerCase() === 'true' ||
    env.DATABASE_SSL === true;
  const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  const url = `postgresql://${auth}@${host}:${port}/${database}${ssl ? '?sslmode=require' : ''}`;

  return { host, port, username, password, database, ssl, url };
}

/**
 * Prefer REDIS_URL (e.g. redis://:pass@host:6379/0 or rediss:// for TLS).
 * Falls back to discrete REDIS_* fields when URL is empty.
 */
export function resolveRedisConnection(env: {
  REDIS_URL?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number | string;
  REDIS_PASSWORD?: string;
  REDIS_DB?: number | string;
}): RedisConnection {
  const raw = (env.REDIS_URL ?? '').trim();
  if (raw) {
    const u = new URL(raw);
    if (!['redis:', 'rediss:'].includes(u.protocol)) {
      throw new Error('REDIS_URL must use redis:// or rediss://');
    }
    const dbPath = u.pathname.replace(/^\//, '');
    const db = dbPath ? Number(dbPath) : 0;
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 6379,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: Number.isFinite(db) ? db : 0,
      url: raw,
    };
  }

  const host = env.REDIS_HOST?.trim();
  if (!host) {
    throw new Error('Set REDIS_URL or REDIS_HOST');
  }
  const port = Number(env.REDIS_PORT ?? 6379);
  const password = env.REDIS_PASSWORD || undefined;
  const db = Number(env.REDIS_DB ?? 0);
  const auth = password ? `:${encodeURIComponent(password)}@` : '';
  const url = `redis://${auth}${host}:${port}/${db}`;

  return { host, port, password, db, url };
}
