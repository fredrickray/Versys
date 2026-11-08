import type { Env } from './env.validation';

export default () => {
  const env = process.env as unknown as Env;
  return {
    nodeEnv: env.NODE_ENV,
    appName: env.APP_NAME,
    apiPort: Number(env.API_PORT ?? 3000),
    realtimePort: Number(env.REALTIME_PORT ?? 3001),
    database: {
      host: env.DATABASE_HOST,
      port: Number(env.DATABASE_PORT ?? 5432),
      username: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      database: env.DATABASE_NAME,
      ssl: String(env.DATABASE_SSL) === 'true' || env.DATABASE_SSL === true,
      logging:
        String(env.DATABASE_LOGGING) === 'true' ||
        env.DATABASE_LOGGING === true,
    },
    redis: {
      host: env.REDIS_HOST,
      port: Number(env.REDIS_PORT ?? 6379),
      password: env.REDIS_PASSWORD || undefined,
      db: Number(env.REDIS_DB ?? 0),
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtl: env.JWT_ACCESS_TTL ?? '15m',
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshTtl: env.JWT_REFRESH_TTL ?? '7d',
    },
    otp: {
      ttlSeconds: Number(env.OTP_TTL_SECONDS ?? 300),
      length: Number(env.OTP_LENGTH ?? 6),
    },
    fcmEnabled: String(env.FCM_ENABLED) === 'true' || env.FCM_ENABLED === true,
    smsProvider: env.SMS_PROVIDER ?? 'mock',
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    locationRetentionDays: Number(env.LOCATION_RETENTION_DAYS ?? 30),
    rateLimitAlertsPerHour: Number(env.RATE_LIMIT_ALERTS_PER_HOUR ?? 10),
  };
};

export type AppConfig = ReturnType<typeof import('./configuration').default>;
