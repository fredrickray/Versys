import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from './naming.strategy';
import { config as dotenv } from 'dotenv';

dotenv({ path: process.env.ENV_FILE ?? '.env' });

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ['src/modules/**/entities/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  namingStrategy: new SnakeNamingStrategy(),
  logging: process.env.DATABASE_LOGGING === 'true',
});
