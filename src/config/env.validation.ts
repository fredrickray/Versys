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

const duration = z.string().regex(/^[1-9]\d*[smhd]$/);

const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  APP_NAME: z.string().default('versys'),

  API_PORT: z.coerce.number().int().positive().default(3000),
  REALTIME_PORT: z.coerce.number().int().positive().default(3001),

  /** Preferred: postgres://user:pass@host:5432/db?sslmode=require */
  DATABASE_URL: z.string().optional().default(''),
  /** Legacy discrete fields, used only when DATABASE_URL is empty. */
  DATABASE_HOST: z.string().optional().default(''),
  DATABASE_PORT: z.coerce.number().int().positive().optional().default(5432),
  DATABASE_USER: z.string().optional().default(''),
  DATABASE_PASSWORD: z.string().optional().default(''),
  DATABASE_NAME: z.string().optional().default(''),
  DATABASE_SSL: bool.default(false),
  DATABASE_LOGGING: bool.default(false),

  /** Preferred: redis://:pass@host:6379/0 or rediss://… */
  REDIS_URL: z.string().optional().default(''),
  /** Legacy discrete fields, used only when REDIS_URL is empty. */
  REDIS_HOST: z.string().optional().default(''),
  REDIS_PORT: z.coerce.number().int().positive().optional().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().nonnegative().optional().default(0),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: duration.default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TTL: duration.default('7d'),

  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TEST_CODE: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),

  FCM_ENABLED: bool.default(false),
  /** Firebase Admin service account, required when FCM_ENABLED=true. */
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  /** PEM private key, using \n for newlines in .env. */
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),

  SMS_PROVIDER: z.enum(['mock', 'termii', 'aggregator']).default('mock'),
  SMS_TERMII_API_KEY: z.string().optional().default(''),
  SMS_TERMII_SENDER_ID: z.string().optional().default(''),
  SMS_TERMII_BASE_URL: z
    .string()
    .optional()
    .default('https://api.ng.termii.com'),
  SMS_TERMII_OTP_CHANNEL: z.string().optional().default('dnd'),
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

  /** Cloudinary incident-media configuration. */
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_UPLOAD_FOLDER: z.string().optional().default('versys/incidents'),

  /** Simulator-only inbound channels until a signed provider adapter is approved. */
  CHANNEL_SIMULATOR_ONLY: bool.default(true),
  /** Shared simulator callback secret, sent as x-versys-webhook-secret. */
  CHANNEL_WEBHOOK_SECRET: z.string().optional().default(''),

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

  EVENT_MODE: bool.default(false),
  EVENT_NAME: z.string().default(''),
  MAINTENANCE_MODE: bool.default(false),
  MAINTENANCE_MESSAGE: z
    .string()
    .default('VERSYS under maintenance — use radio / dispatcher hotline'),
});

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  try {
    resolvePostgresConnection(env);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message:
        error instanceof Error ? error.message : 'Invalid database configuration',
    });
  }
  try {
    resolveRedisConnection(env);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message:
        error instanceof Error ? error.message : 'Invalid Redis configuration',
    });
  }
  if (!env.CHANNEL_SIMULATOR_ONLY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CHANNEL_SIMULATOR_ONLY'],
      message: 'live inbound channels require an approved signed provider adapter',
    });
  }
  if (
    (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') &&
    env.CHANNEL_WEBHOOK_SECRET.trim().length < 32
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CHANNEL_WEBHOOK_SECRET'],
      message: 'must contain at least 32 characters outside development and test',
    });
  }
  if (env.OTP_TEST_CODE && env.NODE_ENV !== 'test') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OTP_TEST_CODE'],
      message: 'is allowed only when NODE_ENV=test',
    });
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_REFRESH_SECRET'],
      message: 'must differ from JWT_ACCESS_SECRET',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}
