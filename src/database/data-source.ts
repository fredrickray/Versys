import 'reflect-metadata';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { config as dotenv } from 'dotenv';
import { resolvePostgresConnection } from '../config/connection-urls';
import { SnakeNamingStrategy } from './naming.strategy';

dotenv({ path: process.env.ENV_FILE ?? '.env' });

/** Works under ts-node (src/) and compiled node (dist/). */
const root = __dirname;
const pg = resolvePostgresConnection(process.env);

export default new DataSource({
  type: 'postgres',
  url: pg.url,
  // Keep discrete fields too — TypeORM uses url when present
  host: pg.host,
  port: pg.port,
  username: pg.username,
  password: pg.password,
  database: pg.database,
  ssl: pg.ssl ? { rejectUnauthorized: false } : false,
  entities: [join(root, '../modules/**/entities/*.{ts,js}')],
  migrations: [join(root, 'migrations/*.{ts,js}')],
  synchronize: false,
  namingStrategy: new SnakeNamingStrategy(),
  logging: process.env.DATABASE_LOGGING === 'true',
});
