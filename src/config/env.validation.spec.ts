import { validateEnv } from './env.validation';

const baseEnv = {
  DATABASE_HOST: 'localhost',
  DATABASE_USER: 'versys',
  DATABASE_PASSWORD: 'versys',
  DATABASE_NAME: 'versys',
  REDIS_HOST: 'localhost',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('environment validation', () => {
  it('allows simulator callbacks without a secret only in development and test', () => {
    expect(validateEnv(baseEnv).CHANNEL_SIMULATOR_ONLY).toBe(true);
    expect(
      validateEnv({ ...baseEnv, NODE_ENV: 'test', CHANNEL_WEBHOOK_SECRET: '' })
        .CHANNEL_SIMULATOR_ONLY,
    ).toBe(true);
  });

  it('requires a high-entropy simulator secret outside local environments', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'staging',
        CHANNEL_WEBHOOK_SECRET: '',
      }),
    ).toThrow('CHANNEL_WEBHOOK_SECRET');

    expect(
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        CHANNEL_WEBHOOK_SECRET: 's'.repeat(32),
      }).CHANNEL_WEBHOOK_SECRET,
    ).toHaveLength(32);
  });

  it('allows deterministic OTPs only in the test environment', () => {
    expect(
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'test',
        OTP_TEST_CODE: '123456',
      }).OTP_TEST_CODE,
    ).toBe('123456');
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        CHANNEL_WEBHOOK_SECRET: 's'.repeat(32),
        OTP_TEST_CODE: '123456',
      }),
    ).toThrow('OTP_TEST_CODE');
  });

  it('rejects unapproved live inbound channels and shared JWT secrets', () => {
    expect(() =>
      validateEnv({ ...baseEnv, CHANNEL_SIMULATOR_ONLY: 'false' }),
    ).toThrow('CHANNEL_SIMULATOR_ONLY');
    expect(() =>
      validateEnv({
        ...baseEnv,
        JWT_REFRESH_SECRET: baseEnv.JWT_ACCESS_SECRET,
      }),
    ).toThrow('JWT_REFRESH_SECRET');
  });
});
