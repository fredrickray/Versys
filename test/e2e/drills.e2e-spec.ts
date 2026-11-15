import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { ApiModule } from '../../src/api.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { CorrelationIdInterceptor } from '../../src/common/interceptors/correlation-id.interceptor';
import {
  IncidentStatus,
  StaffCategory,
  UserCategory,
} from '../../src/common/enums';
import { IncidentEntity } from '../../src/modules/incidents/entities/incident.entity';
import { NotificationAttemptEntity } from '../../src/modules/notifications/entities/notification-attempt.entity';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { RedisService } from '../../src/redis/redis.service';

const OTP_TEST_CODE = '123456';
process.env.OTP_TEST_CODE ??= OTP_TEST_CODE;

type Tokens = { accessToken: string };
type IncidentBody = {
  id: string;
  publicCode: string;
  isDrill: boolean;
  drillPurpose: string | null;
};

describe('drill isolation', () => {
  let app: INestApplication;
  let redis: RedisService;
  let incidents: Repository<IncidentEntity>;
  let attempts: Repository<NotificationAttemptEntity>;
  let users: Repository<UserEntity>;
  let notifications: NotificationsService;

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

    const dataSource = app.get(DataSource);
    redis = app.get(RedisService);
    incidents = dataSource.getRepository(IncidentEntity);
    attempts = dataSource.getRepository(NotificationAttemptEntity);
    users = dataSource.getRepository(UserEntity);
    notifications = app.get(NotificationsService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  function server(): Parameters<typeof request>[0] {
    return app.getHttpServer() as Parameters<typeof request>[0];
  }

  async function login(phoneE164: string, deviceId: string): Promise<string> {
    await redis.client.del(`otp:throttle:${phoneE164}`);
    await request(server())
      .post('/v1/auth/otp/request')
      .send({ phoneE164 })
      .expect(202);
    const response: Response = await request(server())
      .post('/v1/auth/otp/verify')
      .send({ phoneE164, code: OTP_TEST_CODE, deviceId })
      .expect(201);
    return (response.body as Tokens).accessToken;
  }

  it('authorizes drill creation, suppresses delivery, and excludes analytics', async () => {
    const suffix = String(Date.now()).slice(-7);
    const reporterPhone = `+234815${suffix}`;
    const managerPhone = `+234816${suffix}`;
    await users.save(
      users.create({
        phoneE164: managerPhone,
        fullName: 'Drill Test Manager',
        staffRoleKey: 'management',
        staffCategory: StaffCategory.CAT_3,
        userCategory: UserCategory.UNIVERSITY_MANAGEMENT,
        isDispatcher: false,
        isActive: true,
      }),
    );

    const reporter = await login(
      reporterPhone,
      '00000000-0000-4000-8000-000000000050',
    );
    const manager = await login(
      managerPhone,
      '00000000-0000-4000-8000-000000000051',
    );

    await request(server())
      .post('/v1/incidents/drills')
      .set('Authorization', `Bearer ${reporter}`)
      .set('Idempotency-Key', `drill-denied-${suffix}`)
      .send({
        type: 'fight',
        channel: 'app_button',
        purpose: 'unauthorized test',
      })
      .expect(403);

    const normalResponse: Response = await request(server())
      .post('/v1/incidents')
      .set('Authorization', `Bearer ${reporter}`)
      .set('Idempotency-Key', `normal-${suffix}`)
      .send({
        type: 'fight',
        channel: 'app_button',
        metadata: { drill: true, isDrill: true },
      })
      .expect(201);
    const normal = normalResponse.body as IncidentBody;
    expect(normal.isDrill).toBe(false);

    const drillResponse: Response = await request(server())
      .post('/v1/incidents/drills')
      .set('Authorization', `Bearer ${manager}`)
      .set('Idempotency-Key', `drill-${suffix}`)
      .send({
        type: 'fire',
        channel: 'app_button',
        purpose: 'annual evacuation validation',
      })
      .expect(201);
    const drill = drillResponse.body as IncidentBody;
    expect(drill.isDrill).toBe(true);
    expect(drill.drillPurpose).toBe('annual evacuation validation');

    expect(await attempts.count({ where: { incidentId: drill.id } })).toBe(0);
    await notifications.onIncidentNotify({
      incidentId: drill.id,
      userIds: [(await users.findOneByOrFail({ phoneE164: managerPhone })).id],
      alertLevel: 2,
      publicCode: drill.publicCode,
      type: 'forged_drill_delivery',
    });
    expect(await attempts.count({ where: { incidentId: drill.id } })).toBe(0);

    const normalEntity = await incidents.findOneByOrFail({ id: normal.id });
    const drillEntity = await incidents.findOneByOrFail({ id: drill.id });
    expect(normalEntity.metadata['drill']).toBeUndefined();
    expect(normalEntity.metadata['isDrill']).toBeUndefined();

    const base = Date.now();
    normalEntity.status = IncidentStatus.RESOLVED;
    normalEntity.firstAcceptedAt = new Date(
      normalEntity.createdAt.getTime() + 1_000,
    );
    normalEntity.resolvedAt = new Date(base);
    drillEntity.status = IncidentStatus.RESOLVED;
    drillEntity.firstAcceptedAt = new Date(
      drillEntity.createdAt.getTime() + 9_999,
    );
    drillEntity.resolvedAt = new Date(base);
    await incidents.save([normalEntity, drillEntity]);

    const from = new Date(
      Math.min(
        normalEntity.createdAt.getTime(),
        drillEntity.createdAt.getTime(),
      ) - 1,
    ).toISOString();
    const to = new Date(base + 1_000).toISOString();
    const summary = await request(server())
      .get('/v1/analytics/summary')
      .query({ from, to })
      .set('Authorization', `Bearer ${manager}`)
      .expect(200);
    expect(summary.body).toMatchObject({
      resolvedCount: 1,
      avgResponseTimeMs: 1_000,
      p50ResponseTimeMs: 1_000,
      p95ResponseTimeMs: 1_000,
    });

    await request(server())
      .get(`/v1/analytics/incidents/${drill.id}`)
      .set('Authorization', `Bearer ${manager}`)
      .expect(404);
  });
});
