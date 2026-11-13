import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request, { type Response } from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { ApiModule } from '../../src/api.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { RefreshSessionEntity } from '../../src/modules/auth/entities/refresh-session.entity';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { RedisService } from '../../src/redis/redis.service';

type TokenBody = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

const OTP_TEST_CODE = '123456';
process.env.OTP_TEST_CODE ??= OTP_TEST_CODE;

describe('device-bound refresh sessions', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redis: RedisService;
  let sessions: Repository<RefreshSessionEntity>;
  let users: Repository<UserEntity>;
  let sequence = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    dataSource = app.get(DataSource);
    redis = app.get(RedisService);
    sessions = dataSource.getRepository(RefreshSessionEntity);
    users = dataSource.getRepository(UserEntity);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  function nextPhone(): string {
    sequence += 1;
    const timestamp = String(Date.now()).slice(-5);
    const suffix = String(sequence).padStart(2, '0');
    return `+2348109${timestamp}${suffix}`;
  }

  function device(suffix: number): string {
    return `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
  }

  function sessionId(refreshToken: string): string {
    const payload = new JwtService().decode<{ sid?: string }>(refreshToken);
    if (!payload?.sid) throw new Error('refresh_session_id_missing');
    return payload.sid;
  }

  async function login(
    phoneE164: string,
    deviceId: string,
  ): Promise<TokenBody> {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await redis.client.del(`otp:throttle:${phoneE164}`);
    await request(server)
      .post('/v1/auth/otp/request')
      .send({ phoneE164 })
      .expect(202);
    const response: Response = await request(server)
      .post('/v1/auth/otp/verify')
      .send({ phoneE164, code: OTP_TEST_CODE, deviceId })
      .expect(201);
    return response.body as TokenBody;
  }

  async function rotate(
    refreshToken: string,
    deviceId: string,
    expectedStatus = 200,
  ): Promise<Response> {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    return request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken, deviceId })
      .expect(expectedStatus);
  }

  it('stores only a token hash and rotates within the same family', async () => {
    const phone = nextPhone();
    const deviceId = device(1);
    const issued = await login(phone, deviceId);
    const issuedSessionId = sessionId(issued.refreshToken);
    const before = await sessions.findOneByOrFail({ id: issuedSessionId });

    expect(before.deviceId).toBe(deviceId);
    expect(before.currentTokenHash).not.toContain(issued.refreshToken);
    expect(before.currentTokenHash).toBe(
      createHash('sha256').update(issued.refreshToken).digest('hex'),
    );

    const response = await rotate(issued.refreshToken, deviceId);
    const rotated = response.body as TokenBody;
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);

    const after = await sessions.findOneByOrFail({ id: issuedSessionId });
    expect(after.currentTokenHash).toBe(
      createHash('sha256').update(rotated.refreshToken).digest('hex'),
    );
    expect(after.lastRotatedAt).toBeTruthy();
    expect(after.revokedAt).toBeNull();
  });

  it('requires the device ID and revokes a family on mismatch', async () => {
    const issued = await login(nextPhone(), device(2));
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: issued.refreshToken })
      .expect(400);

    await rotate(issued.refreshToken, device(3), 401);
    await rotate(issued.refreshToken, device(2), 401);
  });

  it('revokes the replacement when a rotated token is reused', async () => {
    const deviceId = device(4);
    const issued = await login(nextPhone(), deviceId);
    const first = await rotate(issued.refreshToken, deviceId);
    const replacement = (first.body as TokenBody).refreshToken;

    await rotate(issued.refreshToken, deviceId, 401);
    await rotate(replacement, deviceId, 401);
  });

  it('serializes concurrent rotation and leaves no usable descendant', async () => {
    const deviceId = device(5);
    const issued = await login(nextPhone(), deviceId);
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const responses = await Promise.all([
      request(server)
        .post('/v1/auth/refresh')
        .send({ refreshToken: issued.refreshToken, deviceId }),
      request(server)
        .post('/v1/auth/refresh')
        .send({ refreshToken: issued.refreshToken, deviceId }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
    const winner = responses.find((response) => response.status === 200);
    expect(winner).toBeTruthy();
    await rotate((winner?.body as TokenBody).refreshToken, deviceId, 401);
  });

  it('isolates separate device families for one user', async () => {
    const phone = nextPhone();
    const familyA = await login(phone, device(6));
    const familyB = await login(phone, device(7));

    await rotate(familyA.refreshToken, device(8), 401);
    await rotate(familyB.refreshToken, device(7), 200);
  });

  it('atomically consumes a salted OTP during concurrent verification', async () => {
    const phoneE164 = nextPhone();
    const deviceId = device(11);
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await redis.client.del(`otp:throttle:${phoneE164}`);
    await request(server)
      .post('/v1/auth/otp/request')
      .send({ phoneE164 })
      .expect(202);

    const stored = await redis.client.get(`otp:${phoneE164}`);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(OTP_TEST_CODE);

    const responses = await Promise.all([
      request(server)
        .post('/v1/auth/otp/verify')
        .send({ phoneE164, code: OTP_TEST_CODE, deviceId }),
      request(server)
        .post('/v1/auth/otp/verify')
        .send({ phoneE164, code: OTP_TEST_CODE, deviceId }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 401,
    ]);

    const user = await users.findOneByOrFail({ phoneE164 });
    expect(await sessions.count({ where: { userId: user.id } })).toBe(1);
  });

  it('rejects access tokens, expired sessions, and inactive users', async () => {
    const phone = nextPhone();
    const deviceId = device(9);
    const issued = await login(phone, deviceId);

    await rotate(issued.accessToken, deviceId, 401);

    const issuedSessionId = sessionId(issued.refreshToken);
    await sessions.update({ id: issuedSessionId }, { expiresAt: new Date(0) });
    await rotate(issued.refreshToken, deviceId, 401);

    const second = await login(phone, device(10));
    await users.update({ phoneE164: phone }, { isActive: false });
    await rotate(second.refreshToken, device(10), 401);
  });
});
