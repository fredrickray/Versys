import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { ApiModule } from '../../src/api.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { CorrelationIdInterceptor } from '../../src/common/interceptors/correlation-id.interceptor';
import { DEMO_PHONES } from '../../src/database/seeds/demo-users.seed';
import { seedAll } from '../../src/database/seeds/seed-runner';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { RedisService } from '../../src/redis/redis.service';

type Tokens = { accessToken: string; refreshToken: string };
type IncidentView = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  reporterPhoneE164?: string;
  metadata?: Record<string, unknown>;
};

const DEVICE_ID = '00000000-0000-4000-8000-000000000020';
const OTP_TEST_CODE = '123456';
process.env.OTP_TEST_CODE ??= OTP_TEST_CODE;

describe('current authorization and incident privacy', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redis: RedisService;
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
    app.useGlobalInterceptors(new CorrelationIdInterceptor());
    await app.init();

    dataSource = app.get(DataSource);
    redis = app.get(RedisService);
    users = dataSource.getRepository(UserEntity);
  }, 60_000);

  beforeEach(async () => {
    await seedAll(dataSource, { demoUsers: true });
  });

  afterAll(async () => {
    await app?.close();
  });

  function server(): Parameters<typeof request>[0] {
    return app.getHttpServer() as Parameters<typeof request>[0];
  }

  function nextPhone(): string {
    sequence += 1;
    const tail = `${String(Date.now()).slice(-6)}${sequence}`.slice(-7);
    return `+234812${tail}`;
  }

  async function login(
    phoneE164: string,
    deviceId = DEVICE_ID,
  ): Promise<Tokens> {
    await redis.client.del(`otp:throttle:${phoneE164}`);
    await request(server())
      .post('/v1/auth/otp/request')
      .send({ phoneE164 })
      .expect(202);
    const response: Response = await request(server())
      .post('/v1/auth/otp/verify')
      .send({ phoneE164, code: OTP_TEST_CODE, deviceId })
      .expect(201);
    return response.body as Tokens;
  }

  async function createIncident(accessToken: string): Promise<IncidentView> {
    const response: Response = await request(server())
      .post('/v1/incidents')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        type: 'fight',
        channel: 'app_button',
        latitude: 9.0765,
        longitude: 7.3986,
        locationLabel: 'privacy-test',
        metadata: { privateNote: 'must-not-leak' },
      })
      .expect(201);
    return response.body as IncidentView;
  }

  it('scopes incident REST access and redacts non-operational fields', async () => {
    const reporter = await login(DEMO_PHONES.reporter);
    const unrelated = await login(
      nextPhone(),
      '00000000-0000-4000-8000-000000000021',
    );
    const dispatcher = await login(DEMO_PHONES.dispatcher);
    const responder = await login(DEMO_PHONES.sheriff);
    const incident = await createIncident(reporter.accessToken);

    expect(incident.latitude).toBeNull();
    expect(incident.longitude).toBeNull();
    expect(incident).not.toHaveProperty('reporterPhoneE164');
    expect(incident).not.toHaveProperty('metadata');

    const reporterView = await request(server())
      .get(`/v1/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .expect(200);
    expect((reporterView.body as IncidentView).latitude).toBeNull();

    await request(server())
      .get(`/v1/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${unrelated.accessToken}`)
      .expect(404);

    const unrelatedList = await request(server())
      .get('/v1/incidents')
      .set('Authorization', `Bearer ${unrelated.accessToken}`)
      .expect(200);
    expect(
      (unrelatedList.body as IncidentView[]).some(
        (row) => row.id === incident.id,
      ),
    ).toBe(false);

    const dispatcherView = await request(server())
      .get(`/v1/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${dispatcher.accessToken}`)
      .expect(200);
    expect((dispatcherView.body as IncidentView).latitude).toBe(9.0765);

    await request(server())
      .get(`/v1/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${responder.accessToken}`)
      .expect(404);
    await request(server())
      .post(`/v1/incidents/${incident.id}/assignments`)
      .set('Authorization', `Bearer ${responder.accessToken}`)
      .send({})
      .expect(201);
    const responderView = await request(server())
      .get(`/v1/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${responder.accessToken}`)
      .expect(200);
    expect((responderView.body as IncidentView).longitude).toBe(7.3986);
  });

  it('applies deactivation and role changes to already-issued access tokens', async () => {
    const dispatcher = await login(DEMO_PHONES.dispatcher);
    const dispatcherUser = await users.findOneByOrFail({
      phoneE164: DEMO_PHONES.dispatcher,
    });

    await request(server())
      .get('/v1/dispatch/board')
      .set('Authorization', `Bearer ${dispatcher.accessToken}`)
      .expect(200);

    await users.update({ id: dispatcherUser.id }, { isDispatcher: false });
    await request(server())
      .get('/v1/dispatch/board')
      .set('Authorization', `Bearer ${dispatcher.accessToken}`)
      .expect(403);

    await users.update(
      { id: dispatcherUser.id },
      { isDispatcher: true, isActive: false },
    );
    await request(server())
      .get('/v1/dispatch/board')
      .set('Authorization', `Bearer ${dispatcher.accessToken}`)
      .expect(401);
  });

  it('removes accepted-responder access after category revocation', async () => {
    const reporter = await login(DEMO_PHONES.reporter);
    const responder = await login(DEMO_PHONES.sheriff);
    const incident = await createIncident(reporter.accessToken);

    await request(server())
      .post(`/v1/incidents/${incident.id}/assignments`)
      .set('Authorization', `Bearer ${responder.accessToken}`)
      .send({})
      .expect(201);

    const responderUser = await users.findOneByOrFail({
      phoneE164: DEMO_PHONES.sheriff,
    });
    await users.update(
      { id: responderUser.id },
      { staffCategory: null, staffRoleKey: null },
    );

    await request(server())
      .get(`/v1/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${responder.accessToken}`)
      .expect(404);
  });

  it('rejects refresh tokens as bearer access tokens and inactive OTP login', async () => {
    const phoneE164 = nextPhone();
    const tokens = await login(
      phoneE164,
      '00000000-0000-4000-8000-000000000022',
    );
    await request(server())
      .get('/v1/incidents')
      .set('Authorization', `Bearer ${tokens.refreshToken}`)
      .expect(401);

    await users.update({ phoneE164 }, { isActive: false });
    await redis.client.del(`otp:throttle:${phoneE164}`);
    await request(server())
      .post('/v1/auth/otp/request')
      .send({ phoneE164 })
      .expect(202);
    await request(server())
      .post('/v1/auth/otp/verify')
      .send({ phoneE164, code: OTP_TEST_CODE, deviceId: DEVICE_ID })
      .expect(401);

    expect(await users.count({ where: { phoneE164 } })).toBe(1);
  });
});
