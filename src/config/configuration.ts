import {
  resolvePostgresConnection,
  resolveRedisConnection,
} from './connection-urls';
import type { Env } from './env.validation';

export default () => {
  const env = process.env as unknown as Env;
  const postgres = resolvePostgresConnection(env);
  const redis = resolveRedisConnection(env);

  return {
    nodeEnv: env.NODE_ENV,
    appName: env.APP_NAME,
    apiPort: Number(env.API_PORT ?? 3000),
    realtimePort: Number(env.REALTIME_PORT ?? 3001),
    database: {
      url: postgres.url,
      host: postgres.host,
      port: postgres.port,
      username: postgres.username,
      password: postgres.password,
      database: postgres.database,
      ssl: postgres.ssl,
      logging:
        String(env.DATABASE_LOGGING) === 'true' ||
        env.DATABASE_LOGGING === true,
    },
    redis: {
      url: redis.url,
      host: redis.host,
      port: redis.port,
      password: redis.password,
      db: redis.db,
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
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID || '',
      clientEmail: env.FIREBASE_CLIENT_EMAIL || '',
      privateKey: env.FIREBASE_PRIVATE_KEY || '',
    },
    smsProvider: env.SMS_PROVIDER ?? 'mock',
    sms: {
      termii: {
        apiKey: env.SMS_TERMII_API_KEY || '',
        senderId: env.SMS_TERMII_SENDER_ID || '',
        baseUrl: env.SMS_TERMII_BASE_URL || 'https://api.ng.termii.com',
        otpChannel: env.SMS_TERMII_OTP_CHANNEL || 'dnd',
        alertChannel: env.SMS_TERMII_ALERT_CHANNEL || 'generic',
      },
    },
    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: env.CLOUDINARY_API_KEY || '',
      apiSecret: env.CLOUDINARY_API_SECRET || '',
      uploadFolder: env.CLOUDINARY_UPLOAD_FOLDER || 'versys/incidents',
    },
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    locationRetentionDays: Number(env.LOCATION_RETENTION_DAYS ?? 30),
    rateLimitAlertsPerHour: Number(env.RATE_LIMIT_ALERTS_PER_HOUR ?? 10),
    rateLimitWebhooksPerMinute: Number(
      env.RATE_LIMIT_WEBHOOKS_PER_MINUTE ?? 60,
    ),
    channelWebhookSecret: env.CHANNEL_WEBHOOK_SECRET || '',
    escalationTimers: {
      PROMPT_AFTER_MS: env.ESCALATION_PROMPT_AFTER_MS
        ? Number(env.ESCALATION_PROMPT_AFTER_MS)
        : undefined,
      AUTO_ESCALATE_AFTER_PROMPT_MS: env.ESCALATION_AUTO_AFTER_PROMPT_MS
        ? Number(env.ESCALATION_AUTO_AFTER_PROMPT_MS)
        : undefined,
      DISPATCHER_RESOLVE_AFTER_MS: env.ESCALATION_DISPATCHER_RESOLVE_AFTER_MS
        ? Number(env.ESCALATION_DISPATCHER_RESOLVE_AFTER_MS)
        : undefined,
      RECONCILER_INTERVAL_MS: env.ESCALATION_RECONCILER_INTERVAL_MS
        ? Number(env.ESCALATION_RECONCILER_INTERVAL_MS)
        : undefined,
    },
    eventMode: String(env.EVENT_MODE) === 'true' || env.EVENT_MODE === true,
    eventName: env.EVENT_NAME || '',
    maintenanceMode:
      String(env.MAINTENANCE_MODE) === 'true' || env.MAINTENANCE_MODE === true,
    maintenanceMessage:
      env.MAINTENANCE_MESSAGE ||
      'VERSYS under maintenance — use radio / dispatcher hotline',
  };
};

export type AppConfig = ReturnType<typeof import('./configuration').default>;
