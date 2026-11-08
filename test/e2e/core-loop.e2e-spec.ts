import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import request, { type Response } from 'supertest';
import { ApiModule } from '../../src/api.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { CorrelationIdInterceptor } from '../../src/common/interceptors/correlation-id.interceptor';
import { IncidentStatus } from '../../src/common/enums';
import { DEMO_PHONES } from '../../src/database/seeds/demo-users.seed';
import { seedAll } from '../../src/database/seeds/seed-runner';
import { NotificationAttemptEntity } from '../../src/modules/notifications/entities/notification-attempt.entity';
import { RedisService } from '../../src/redis/redis.service';

type TokenBody = { accessToken: string };
type IncidentBody = {
  id: string;
  publicCode: string;
  status: string;
};
type AssignmentBody = { status: string };
type BoardRow = { id: string };

/**
 * Phase 1 gate: alert → notify → accept → dispatcher sees it.
 * Requires Postgres + Redis (CI services or local docker compose).
 */
describe('core-loop (Phase 1)', () => {
  let app: INestApplication;
  let redis: RedisService;
  let attempts: Repository<NotificationAttemptEntity>;

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

    const ds = app.get(DataSource);
    await seedAll(ds, { demoUsers: true });
    redis = app.get(RedisService);
    attempts = ds.getRepository(NotificationAttemptEntity);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  async function login(phoneE164: string): Promise<string> {
    await redis.client.del(`otp:throttle:${phoneE164}`);
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server)
      .post('/v1/auth/otp/request')
      .send({ phoneE164 })
      .expect(202);

    const code = await redis.client.get(`otp:${phoneE164}`);
    expect(code).toBeTruthy();

    const res: Response = await request(server)
      .post('/v1/auth/otp/verify')
      .send({ phoneE164, code })
      .expect(201);

    const body = res.body as TokenBody;
    expect(body.accessToken).toBeTruthy();
    return body.accessToken;
  }

  async function waitForNotifications(
    incidentId: string,
    minCount: number,
  ): Promise<NotificationAttemptEntity[]> {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const rows = await attempts.find({ where: { incidentId } });
      if (rows.length >= minCount) return rows;
      await new Promise((r) => setTimeout(r, 100));
    }
    return attempts.find({ where: { incidentId } });
  }

  it('raises an alert, notifies nearest Level 1, accepts, dispatcher observes', async () => {
    const reporterToken = await login(DEMO_PHONES.reporter);
    const sheriffToken = await login(DEMO_PHONES.sheriff);
    const dispatcherToken = await login(DEMO_PHONES.dispatcher);
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    // Campus coords near Veritas (approx) — GEO optional; fallback covers staff roles
    const created: Response = await request(server)
      .post('/v1/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        type: 'fight',
        channel: 'app_button',
        latitude: 9.0765,
        longitude: 7.3986,
        locationLabel: 'e2e-core-loop',
      })
      .expect(201);

    const incident = created.body as IncidentBody;
    expect(incident.publicCode).toBeTruthy();
    expect(incident.status).toBe(IncidentStatus.REPORTED);

    const notes = await waitForNotifications(incident.id, 2);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(
      notes.some((n) => n.status === 'sent' || n.status === 'pending'),
    ).toBe(true);

    const assignmentRes: Response = await request(server)
      .post(`/v1/incidents/${incident.id}/assignments`)
      .set('Authorization', `Bearer ${sheriffToken}`)
      .send({})
      .expect(201);

    const assignment = assignmentRes.body as AssignmentBody;
    expect(assignment.status).toBe('accepted');

    const incidentRes: Response = await request(server)
      .get(`/v1/incidents/${incident.id}`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .expect(200);

    expect((incidentRes.body as IncidentBody).status).toBe(
      IncidentStatus.INTERVENTION_ONGOING,
    );

    const boardRes: Response = await request(server)
      .get('/v1/dispatch/board')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .expect(200);

    const onBoard = (boardRes.body as BoardRow[]).find(
      (row) => row.id === incident.id,
    );
    expect(onBoard).toBeTruthy();
  });
});
