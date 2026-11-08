import 'reflect-metadata';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from './naming.strategy';
import { config as dotenv } from 'dotenv';

dotenv({ path: process.env.ENV_FILE ?? '.env' });

/** Works under ts-node (src/) and compiled node (dist/). */
const root = __dirname;

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [join(root, '../modules/**/entities/*.{ts,js}')],
  migrations: [join(root, 'migrations/*.{ts,js}')],
  synchronize: false,
  namingStrategy: new SnakeNamingStrategy(),
  logging: process.env.DATABASE_LOGGING === 'true',
});
