import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { type Test as SupertestTest } from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { ApiModule } from '../../src/api.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { CorrelationIdInterceptor } from '../../src/common/interceptors/correlation-id.interceptor';
import { IncidentChannel } from '../../src/common/enums';
import { seedAll } from '../../src/database/seeds/seed-runner';
import { InboundRequestEntity } from '../../src/modules/channels/entities/inbound-request.entity';
import { InboundIdempotencyService } from '../../src/modules/channels/inbound-idempotency.service';
import { IncidentEntity } from '../../src/modules/incidents/entities/incident.entity';

type SmsBody =
  | { ok: true; publicCode: string; incidentId: string }
  | { ok: false; reason: string };

type UssdBody = { sessionId: string; message: string; end: boolean };

let sequence = 0;
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function phone(): string {
  return `+234811${String(Date.now()).slice(-6)}${String(sequence).padStart(1, '0')}`;
}

describe('inbound channel idempotency', () => {
  let app: INestApplication;
  let incidents: Repository<IncidentEntity>;
  let inboundRequests: Repository<InboundRequestEntity>;
  let idempotency: InboundIdempotencyService;

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
    await seedAll(dataSource, { demoUsers: true });
    incidents = dataSource.getRepository(IncidentEntity);
    inboundRequests = dataSource.getRepository(InboundRequestEntity);
    idempotency = app.get(InboundIdempotencyService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  function server(): Parameters<typeof request>[0] {
    return app.getHttpServer() as Parameters<typeof request>[0];
  }

  function sms(payload: {
    fromE164: string;
    body: string;
    providerMessageId: string;
  }): SupertestTest {
    return request(server()).post('/v1/channels/sms/inbound').send(payload);
  }

  function ussd(payload: {
    phoneE164: string;
    sessionId?: string;
    text?: string;
  }): SupertestTest {
    return request(server()).post('/v1/channels/ussd/session').send(payload);
  }

  it('uses HTTP 200 for normal SMS branches and replays a completed incident', async () => {
    const fromE164 = phone();
    const providerMessageId = unique('sms-replay');
    const payload = { fromE164, body: 'FIRE MAIN_GATE', providerMessageId };

    const created = await sms(payload).expect(200);
    const replay = await sms(payload).expect(200);
    expect(replay.body).toEqual(created.body);

    const rows = await incidents.find({
      where: { channel: IncidentChannel.SMS, reporterPhoneE164: fromE164 },
    });
    expect(rows).toHaveLength(1);
    expect((created.body as SmsBody).ok).toBe(true);
    expect(
      await inboundRequests.count({
        where: { source: 'sms', providerKey: providerMessageId },
      }),
    ).toBe(1);

    await sms({
      fromE164: phone(),
      body: 'not an emergency command',
      providerMessageId: unique('sms-help'),
    }).expect(200);
  });

  it('rejects a provider message ID reused with different SMS content', async () => {
    const fromE164 = phone();
    const providerMessageId = unique('sms-conflict');
    await sms({ fromE164, body: 'FIRE MAIN_GATE', providerMessageId }).expect(
      200,
    );

    await sms({ fromE164, body: 'FIGHT MAIN_GATE', providerMessageId }).expect(
      409,
    );
  });

  it('serializes concurrent first SMS delivery without duplicate incidents', async () => {
    const fromE164 = phone();
    const payload = {
      fromE164,
      body: 'FIRE MAIN_GATE',
      providerMessageId: unique('sms-concurrent'),
    };

    const responses = await Promise.all([sms(payload), sms(payload)]);
    expect(
      responses
        .map((response) => response.status)
        .every((status) => status === 200 || status === 503),
    ).toBe(true);

    const settled = responses.find((response) => response.status === 200);
    expect(settled).toBeTruthy();
    const replay = await sms(payload).expect(200);
    expect(replay.body).toEqual(settled?.body);

    const rows = await incidents.find({
      where: { channel: IncidentChannel.SMS, reporterPhoneE164: fromE164 },
    });
    expect(rows).toHaveLength(1);
  });

  it('uses Redis only for intermediate USSD navigation and replays terminal confirmation', async () => {
    const phoneE164 = phone();
    const started = (await ussd({ phoneE164 }).expect(200)).body as UssdBody;
    const sessionId = started.sessionId;

    await ussd({ phoneE164, sessionId, text: '1' }).expect(200);
    await ussd({ phoneE164, sessionId, text: '4' }).expect(200);
    await ussd({ phoneE164, sessionId, text: '1' }).expect(200);
    const completed = await ussd({
      phoneE164,
      sessionId,
      text: '1',
    }).expect(200);
    const replay = await ussd({ phoneE164, sessionId, text: '1' }).expect(200);

    expect(replay.body).toEqual(completed.body);
    expect((completed.body as UssdBody).end).toBe(true);
    const rows = await incidents.find({
      where: { channel: IncidentChannel.USSD, reporterPhoneE164: phoneE164 },
    });
    expect(rows).toHaveLength(1);
  });

  it('returns a retryable in-progress result while a claim owns the lease', async () => {
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const providerKey = unique('direct-lease');
    const payload = { phoneE164: phone(), action: 'confirm' };

    const first = idempotency.execute(
      'test',
      providerKey,
      payload,
      async () => {
        entered?.();
        await waitForRelease;
        return {
          httpStatus: 200,
          body: { ok: true },
          value: null,
        };
      },
    );
    await enteredPromise;

    const duplicate = await idempotency.execute(
      'test',
      providerKey,
      payload,
      () => Promise.reject(new Error('duplicate handler must not run')),
    );
    expect(duplicate).toMatchObject({ kind: 'in_progress' });

    release?.();
    await first;
  });
});
