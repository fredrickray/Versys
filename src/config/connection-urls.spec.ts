import {
  resolvePostgresConnection,
  resolveRedisConnection,
} from './connection-urls';

describe('connection-urls', () => {
  it('parses DATABASE_URL', () => {
    const pg = resolvePostgresConnection({
      DATABASE_URL:
        'postgresql://versys:secret@db.example:5432/versys?sslmode=require',
    });
    expect(pg.host).toBe('db.example');
    expect(pg.port).toBe(5432);
    expect(pg.username).toBe('versys');
    expect(pg.password).toBe('secret');
    expect(pg.database).toBe('versys');
    expect(pg.ssl).toBe(true);
  });

  it('falls back to discrete DATABASE_* fields', () => {
    const pg = resolvePostgresConnection({
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 5433,
      DATABASE_USER: 'versys',
      DATABASE_PASSWORD: 'versys',
      DATABASE_NAME: 'versys',
    });
    expect(pg.host).toBe('localhost');
    expect(pg.port).toBe(5433);
    expect(pg.url).toContain('localhost:5433/versys');
  });

  it('parses REDIS_URL with db index', () => {
    const r = resolveRedisConnection({
      REDIS_URL: 'redis://:pw@redis.example:6380/2',
    });
    expect(r.host).toBe('redis.example');
    expect(r.port).toBe(6380);
    expect(r.password).toBe('pw');
    expect(r.db).toBe(2);
  });
});
