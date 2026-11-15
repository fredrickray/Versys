import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { ApiModule } from '../../src/api.module';
import {
  AlertLevel,
  IncidentChannel,
  IncidentStatus,
  IncidentType,
  NotificationChannel,
  UserCategory,
} from '../../src/common/enums';
import { MockMessagingProvider } from '../../src/modules/channels/providers/mock.provider';
import { IncidentEntity } from '../../src/modules/incidents/entities/incident.entity';
import { NotificationAttemptEntity } from '../../src/modules/notifications/entities/notification-attempt.entity';
import { NotificationFallbackEntity } from '../../src/modules/notifications/entities/notification-fallback.entity';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { UserEntity } from '../../src/modules/users/entities/user.entity';

describe('durable notification fallback', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let attempts: Repository<NotificationAttemptEntity>;
  let fallbacks: Repository<NotificationFallbackEntity>;
  let notifications: NotificationsService;
  let mockSms: MockMessagingProvider;
  let user: UserEntity;
  let incident: IncidentEntity;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    attempts = dataSource.getRepository(NotificationAttemptEntity);
    fallbacks = dataSource.getRepository(NotificationFallbackEntity);
    notifications = app.get(NotificationsService);
    mockSms = app.get(MockMessagingProvider);

    user = await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        phoneE164: `+234819${String(Date.now()).slice(-7)}`,
        fullName: 'Fallback Test User',
        staffRoleKey: null,
        staffCategory: null,
        userCategory: UserCategory.GENERAL,
        isDispatcher: false,
        isActive: true,
      }),
    );
    incident = await dataSource.getRepository(IncidentEntity).save(
      dataSource.getRepository(IncidentEntity).create({
        publicCode: `NOT-${randomUUID().slice(0, 8)}`,
        type: IncidentType.FIGHT,
        status: IncidentStatus.REPORTED,
        alertLevel: AlertLevel.LOW,
        channel: IncidentChannel.APP_BUTTON,
        reporterUserId: user.id,
        reporterPhoneE164: user.phoneE164,
        locationLabel: 'fallback-test',
        placeId: null,
        latitude: null,
        longitude: null,
        promptIssuedAt: null,
        firstAcceptedAt: null,
        resolvedAt: null,
        resolvedByUserId: null,
        escalationGeneration: 0,
        escalationHoldAt: null,
        isDrill: false,
        drillPurpose: null,
        drillActorUserId: null,
        metadata: {},
      }),
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('repairs missing durable work and sends it only once', async () => {
    const attempt = await createAttempt('repair');
    expect(await notifications.repairFallbacks()).toBeGreaterThanOrEqual(1);
    await notifications.sendSmsFallback(attempt.id);
    await notifications.sendSmsFallback(attempt.id);

    const fallback = await fallbacks.findOneByOrFail({ attemptId: attempt.id });
    expect(fallback.status).toBe('sent');
    expect(mockSms.deliveryCount(fallback.eventKey)).toBe(1);
  });

  it('suppresses a fallback when acknowledgement wins', async () => {
    const attempt = await createAttempt('ack-first');
    const fallback = await createFallback(attempt.id, 'ack-first');

    await notifications.ack(attempt.id, user.id);
    await notifications.sendSmsFallback(attempt.id);

    const current = await fallbacks.findOneByOrFail({ attemptId: attempt.id });
    expect(current.status).toBe('cancelled');
    expect(mockSms.deliveryCount(fallback.eventKey)).toBe(0);
  });

  it('records a late acknowledgement without duplicating a sent fallback', async () => {
    const attempt = await createAttempt('send-first');
    const fallback = await createFallback(attempt.id, 'send-first');

    await notifications.sendSmsFallback(attempt.id);
    await notifications.ack(attempt.id, user.id);
    await notifications.sendSmsFallback(attempt.id);

    const current = await fallbacks.findOneByOrFail({ attemptId: attempt.id });
    expect(current.status).toBe('sent');
    expect(mockSms.deliveryCount(fallback.eventKey)).toBe(1);
    expect(
      (await attempts.findOneByOrFail({ id: attempt.id })).ackedAt,
    ).toBeTruthy();
  });

  it('serializes acknowledgement against a due fallback', async () => {
    const attempt = await createAttempt('concurrent');
    const fallback = await createFallback(attempt.id, 'concurrent');

    await Promise.all([
      notifications.ack(attempt.id, user.id),
      notifications.sendSmsFallback(attempt.id),
    ]);
    await notifications.sendSmsFallback(attempt.id);

    const current = await fallbacks.findOneByOrFail({ attemptId: attempt.id });
    expect(['cancelled', 'sent']).toContain(current.status);
    expect(mockSms.deliveryCount(fallback.eventKey)).toBeLessThanOrEqual(1);
  });

  async function createAttempt(
    label: string,
  ): Promise<NotificationAttemptEntity> {
    return attempts.save(
      attempts.create({
        userId: user.id,
        incidentId: incident.id,
        channel: NotificationChannel.FCM,
        templateKey: 'incident_alert',
        intentKey: `fallback-test:${label}:${randomUUID()}`,
        status: 'sent',
        payload: { title: 'Emergency', body: label },
        ackedAt: null,
      }),
    );
  }

  function createFallback(
    attemptId: string,
    label: string,
  ): Promise<NotificationFallbackEntity> {
    const now = new Date();
    return fallbacks.save(
      fallbacks.create({
        attemptId,
        eventKey: `notification.sms-fallback.${label}.${randomUUID()}`,
        status: 'pending',
        dueAt: now,
        nextAttemptAt: now,
        attemptCount: 0,
        lastError: null,
        providerMessageId: null,
        sentAt: null,
        cancelledAt: null,
      }),
    );
  }
});
