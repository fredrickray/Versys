import { z } from 'zod';
import {
  resolvePostgresConnection,
  resolveRedisConnection,
} from './connection-urls';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean'
      ? v
      : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
  );

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    APP_NAME: z.string().default('versys'),

    API_PORT: z.coerce.number().int().positive().default(3000),
    REALTIME_PORT: z.coerce.number().int().positive().default(3001),

    /** Preferred: postgres://user:pass@host:5432/db?sslmode=require */
    DATABASE_URL: z.string().optional().default(''),
    /** Legacy discrete fields — used only when DATABASE_URL is empty */
    DATABASE_HOST: z.string().optional().default(''),
    DATABASE_PORT: z.coerce.number().int().positive().optional().default(5432),
    DATABASE_USER: z.string().optional().default(''),
    DATABASE_PASSWORD: z.string().optional().default(''),
    DATABASE_NAME: z.string().optional().default(''),
    DATABASE_SSL: bool.default(false),
    DATABASE_LOGGING: bool.default(false),

    /** Preferred: redis://:pass@host:6379/0 or rediss://… */
    REDIS_URL: z.string().optional().default(''),
    /** Legacy discrete fields — used only when REDIS_URL is empty */
    REDIS_HOST: z.string().optional().default(''),
    REDIS_PORT: z.coerce.number().int().positive().optional().default(6379),
    REDIS_PASSWORD: z.string().optional().default(''),
    REDIS_DB: z.coerce.number().int().nonnegative().optional().default(0),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_TTL: z.string().default('7d'),

    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),

    FCM_ENABLED: bool.default(false),
    /** Firebase Admin service account — required when FCM_ENABLED=true for real pushes */
    FIREBASE_PROJECT_ID: z.string().optional().default(''),
    FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
    /** PEM private key; use \n for newlines in .env */
    FIREBASE_PRIVATE_KEY: z.string().optional().default(''),

    SMS_PROVIDER: z.enum(['mock', 'termii', 'aggregator']).default('mock'),
    SMS_TERMII_API_KEY: z.string().optional().default(''),
    SMS_TERMII_SENDER_ID: z.string().optional().default(''),
    SMS_TERMII_BASE_URL: z
      .string()
      .optional()
      .default('https://api.ng.termii.com'),
    /** Termii channel for OTP (dnd reaches DND-listed numbers). */
    SMS_TERMII_OTP_CHANNEL: z.string().optional().default('dnd'),
    /** Termii channel for alert / fallback SMS. */
    SMS_TERMII_ALERT_CHANNEL: z.string().optional().default('generic'),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:8081'),

    LOCATION_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_ALERTS_PER_HOUR: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_WEBHOOKS_PER_MINUTE: z.coerce
      .number()
      .int()
      .positive()
      .default(60),

    /** Cloudinary (incident photo uploads). All three required for uploads to work. */
    CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
    CLOUDINARY_API_KEY: z.string().optional().default(''),
    CLOUDINARY_API_SECRET: z.string().optional().default(''),
    CLOUDINARY_UPLOAD_FOLDER: z.string().optional().default('versys/incidents'),

    /** Optional shared secret for SMS/USSD aggregator webhooks (header x-versys-webhook-secret) */
    CHANNEL_WEBHOOK_SECRET: z.string().optional().default(''),

    /** Drill / staging timer overrides (ms). Empty = production defaults. */
    ESCALATION_PROMPT_AFTER_MS: z.coerce.number().int().positive().optional(),
    ESCALATION_AUTO_AFTER_PROMPT_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    ESCALATION_DISPATCHER_RESOLVE_AFTER_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    ESCALATION_RECONCILER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),

    /** Championship / live-event posture — banners + ops status only; does not block alerts. */
    EVENT_MODE: bool.default(false),
    EVENT_NAME: z.string().default(''),
    /** Planned outage only — 503 everything except /health and /ready. */
    MAINTENANCE_MODE: bool.default(false),
    MAINTENANCE_MESSAGE: z
      .string()
      .default('VERSYS under maintenance — use radio / dispatcher hotline'),
  })
  .superRefine((data, ctx) => {
    try {
      resolvePostgresConnection(data);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: err instanceof Error ? err.message : 'Invalid database config',
      });
    }
    try {
      resolveRedisConnection(data);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: err instanceof Error ? err.message : 'Invalid redis config',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}
