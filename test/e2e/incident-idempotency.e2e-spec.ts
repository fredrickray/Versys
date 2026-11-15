import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request, { type Response, type Test as SupertestTest } from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { ApiModule } from '../../src/api.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { CorrelationIdInterceptor } from '../../src/common/interceptors/correlation-id.interceptor';
import { IncidentChannel } from '../../src/common/enums';
import { IncidentEntity } from '../../src/modules/incidents/entities/incident.entity';
import { RedisService } from '../../src/redis/redis.service';
import { WorkerModule } from '../../src/worker.module';

const OTP_TEST_CODE = '123456';
const DEVICE_ID = '00000000-0000-4000-8000-000000000040';
process.env.OTP_TEST_CODE ??= OTP_TEST_CODE;

type Tokens = { accessToken: string };
type IncidentBody = { id: string; publicCode: string };

let sequence = 0;
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

describe('online and offline incident idempotency', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redis: RedisService;
  let incidents: Repository<IncidentEntity>;

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
    app.useGlobalInterceptors(new CorrelationIdInterceptor());
    await app.init();

    dataSource = app.get(DataSource);
    redis = app.get(RedisService);
    incidents = dataSource.getRepository(IncidentEntity);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  function server(): Parameters<typeof request>[0] {
    return app.getHttpServer() as Parameters<typeof request>[0];
  }

  function nextPhone(): string {
    sequence += 1;
    return `+234814${String(Date.now()).slice(-6)}${sequence}`;
  }

  async function login(phoneE164: string): Promise<string> {
    await redis.client.del(`otp:throttle:${phoneE164}`);
    await request(server())
      .post('/v1/auth/otp/request')
      .send({ phoneE164 })
      .expect(202);
    const response: Response = await request(server())
      .post('/v1/auth/otp/verify')
      .send({ phoneE164, code: OTP_TEST_CODE, deviceId: DEVICE_ID })
      .expect(201);
    return (response.body as Tokens).accessToken;
  }

  function create(token: string, key: string, type = 'fight'): SupertestTest {
    return request(server())
      .post('/v1/incidents')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        type,
        channel: 'app_button',
        latitude: 9.0765,
        longitude: 7.3986,
        locationLabel: 'idempotency-test',
      });
  }

  it('replays sequential and concurrent online submissions once', async () => {
    const phoneE164 = nextPhone();
    const token = await login(phoneE164);
    const key = unique('online');

    const first = await create(token, key).expect(201);
    const replay = await create(token, key).expect(201);
    expect(replay.body).toEqual(first.body);

    const concurrentKey = unique('online-concurrent');
    const responses = await Promise.all([
      create(token, concurrentKey),
      create(token, concurrentKey),
    ]);
    expect(
      responses.every(
        (response) => response.status === 201 || response.status === 503,
      ),
    ).toBe(true);
    const completed = await create(token, concurrentKey).expect(201);

    const rows = await incidents.find({
      where: {
        reporterPhoneE164: null,
        reporterUserId: await userId(phoneE164),
      },
    });
    const ids = new Set([
      (first.body as IncidentBody).id,
      (completed.body as IncidentBody).id,
    ]);
    expect(rows.filter((row) => ids.has(row.id))).toHaveLength(2);
  });

  it('rejects missing and conflicting online idempotency keys', async () => {
    const token = await login(nextPhone());
    await request(server())
      .post('/v1/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'fight', channel: 'app_button' })
      .expect(400);

    const key = unique('online-conflict');
    await create(token, key, 'fight').expect(201);
    await create(token, key, 'fire').expect(409);
  });

  it('recovers a durable offline submission after Redis queue loss', async () => {
    const phoneE164 = nextPhone();
    const token = await login(phoneE164);
    const clientEventId = unique('offline:client');
    const payload = {
      clientEventId,
      type: 'fight',
      channel: 'app_button',
      capturedAt: new Date().toISOString(),
      locationLabel: 'offline-recovery',
    };

    await request(server())
      .post('/v1/incidents/offline')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(202);

    await redis.client.flushdb();
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      const reporterUserId = await userId(phoneE164);
      const recovered = await waitFor(async () => {
        const rows = await incidents.find({
          where: {
            reporterUserId,
            channel: IncidentChannel.APP_BUTTON,
            locationLabel: 'offline-recovery',
          },
        });
        return rows[0] ?? null;
      });

      const replay = await request(server())
        .post('/v1/incidents/offline')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(202);
      expect((replay.body as { incidentId: string }).incidentId).toBe(
        recovered.id,
      );

      const rows = await incidents.find({
        where: { reporterUserId, locationLabel: 'offline-recovery' },
      });
      expect(rows).toHaveLength(1);
    } finally {
      await worker.close();
    }
  }, 30_000);

  async function userId(phoneE164: string): Promise<string> {
    const result = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM users WHERE phone_e164 = $1`,
      [phoneE164],
    );
    return result[0].id;
  }
});

async function waitFor<T>(
  query: () => Promise<T | null>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await query();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('condition_timeout');
}
