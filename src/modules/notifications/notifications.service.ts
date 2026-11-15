import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AlertLevel, NotificationChannel } from '../../common/enums';
import { QueueName } from '../../queues/queue-names';
import { ChannelsService } from '../channels/channels.service';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { UserEntity } from '../users/entities/user.entity';
import { NotificationAttemptEntity } from './entities/notification-attempt.entity';
import { NotificationFallbackEntity } from './entities/notification-fallback.entity';
import { FcmProvider } from './providers/fcm.provider';

export type NotifyTargetsPayload = {
  incidentId: string | null;
  userIds: string[];
  alertLevel: AlertLevel | number;
  publicCode: string;
  type: string;
  title?: string;
  body?: string;
  announcementId?: string;
  alarm?: boolean;
  blinkingBlue?: boolean;
  eventKey?: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly ackTimeoutMs: number;
  private readonly fallbackMaxAgeMs: number;
  private readonly fallbackMaxAttempts: number;

  constructor(
    @InjectRepository(NotificationAttemptEntity)
    private readonly attempts: Repository<NotificationAttemptEntity>,
    @InjectRepository(NotificationFallbackEntity)
    private readonly fallbacks: Repository<NotificationFallbackEntity>,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly fcm: FcmProvider,
    private readonly channels: ChannelsService,
    @InjectQueue(QueueName.NOTIFICATIONS) private readonly notifyQueue: Queue,
  ) {
    this.ackTimeoutMs = config.getOrThrow<number>('notifications.ackTimeoutMs');
    this.fallbackMaxAgeMs = config.getOrThrow<number>(
      'notifications.fallbackMaxAgeMs',
    );
    this.fallbackMaxAttempts = config.getOrThrow<number>(
      'notifications.fallbackMaxAttempts',
    );
  }

  @OnEvent('incident.notify_targets')
  async onIncidentNotify(payload: NotifyTargetsPayload): Promise<void> {
    if (await this.isDrill(payload.incidentId)) {
      this.logger.warn(
        `Suppressed external delivery for drill ${payload.incidentId}`,
      );
      return;
    }

    const level = Number(payload.alertLevel);
    const high = level >= Number(AlertLevel.HIGH);
    const title =
      payload.title ??
      (payload.blinkingBlue
        ? 'Announcement'
        : high
          ? 'HIGH emergency'
          : 'Emergency alert');
    const body = payload.body ?? `${payload.type} · ${payload.publicCode}`;

    for (const userId of payload.userIds) {
      const intentKey = payload.eventKey
        ? `${payload.eventKey}:${userId}`
        : null;
      let attempt = intentKey
        ? await this.attempts.findOne({ where: { intentKey } })
        : null;
      if (
        attempt &&
        (attempt.status === 'sent' ||
          attempt.status === 'acked' ||
          attempt.status === 'fallback_sms')
      ) {
        continue;
      }
      if (!attempt) {
        attempt = await this.attempts.save(
          this.attempts.create({
            userId,
            incidentId: payload.incidentId,
            channel: NotificationChannel.FCM,
            templateKey: payload.blinkingBlue
              ? 'announcement'
              : 'incident_alert',
            intentKey,
            status: 'pending',
            payload: {
              title,
              body,
              alertLevel: payload.alertLevel,
              announcementId: payload.announcementId ?? null,
            },
          }),
        );
      }

      const result = await this.fcm.send({
        userId,
        title,
        body,
        highPriority: high || !!payload.alarm,
        alarm: high || !!payload.alarm,
        vibrate: high || !!payload.alarm,
        blinkingBlue: !!payload.blinkingBlue,
        data: {
          incidentId: payload.incidentId ?? '',
          publicCode: payload.publicCode,
          alertLevel: String(payload.alertLevel),
          attemptId: attempt.id,
        },
      });

      const fallbackPending = await this.dataSource.transaction(
        async (manager) => {
          const current = await this.lockAttempt(manager, attempt.id);
          if (!current) return false;

          if (!result.ok) {
            if (!current.ackedAt) current.status = 'failed';
            await manager
              .getRepository(NotificationAttemptEntity)
              .save(current);
            return false;
          }

          if (current.ackedAt) current.status = 'acked';
          else current.status = 'sent';
          await manager.getRepository(NotificationAttemptEntity).save(current);

          if (payload.blinkingBlue) return false;
          const dueAt = new Date(Date.now() + this.ackTimeoutMs);
          await this.insertFallback(
            manager,
            current,
            current.ackedAt ? 'cancelled' : 'pending',
            dueAt,
          );
          return !current.ackedAt;
        },
      );

      if (fallbackPending) await this.scheduleFallback(attempt.id);
    }

    this.logger.log(
      `Notified ${payload.userIds.length} users for ${payload.publicCode}`,
    );
  }

  async ack(attemptId: string, userId: string): Promise<{ ok: true }> {
    await this.dataSource.transaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);
      if (!attempt || attempt.userId !== userId) {
        throw new NotFoundException('notification_not_found');
      }

      const now = new Date();
      if (!attempt.ackedAt) attempt.ackedAt = now;
      attempt.status = 'acked';
      await manager.getRepository(NotificationAttemptEntity).save(attempt);

      const fallback = await this.lockFallback(manager, attemptId);
      if (fallback?.status === 'pending') {
        fallback.status = 'cancelled';
        fallback.cancelledAt = now;
        await manager.getRepository(NotificationFallbackEntity).save(fallback);
      }
    });

    try {
      const job = await this.notifyQueue.getJob(fallbackJobId(attemptId));
      if (job) await job.remove();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Fallback job cleanup deferred ${attemptId}: ${message}`,
      );
    }
    return { ok: true };
  }

  async sendSmsFallback(attemptId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);
      if (!attempt) return;
      const fallback = await this.lockFallback(manager, attemptId);
      if (!fallback || fallback.status !== 'pending') return;

      const now = new Date();
      if (attempt.ackedAt || attempt.status === 'acked') {
        fallback.status = 'cancelled';
        fallback.cancelledAt = now;
        await manager.getRepository(NotificationFallbackEntity).save(fallback);
        return;
      }
      if (fallback.nextAttemptAt.getTime() > now.getTime()) return;
      if (now.getTime() - attempt.createdAt.getTime() > this.fallbackMaxAgeMs) {
        fallback.status = 'dead';
        fallback.lastError = 'fallback_expired';
        await manager.getRepository(NotificationFallbackEntity).save(fallback);
        return;
      }
      if (await this.isDrill(attempt.incidentId, manager)) {
        fallback.status = 'cancelled';
        fallback.cancelledAt = now;
        fallback.lastError = 'drill_suppressed';
        await manager.getRepository(NotificationFallbackEntity).save(fallback);
        return;
      }

      const user = await manager.getRepository(UserEntity).findOne({
        where: { id: attempt.userId, isActive: true },
      });
      if (!user?.phoneE164) {
        fallback.status = 'dead';
        fallback.lastError = 'recipient_unavailable';
        await manager.getRepository(NotificationFallbackEntity).save(fallback);
        return;
      }

      const title =
        typeof attempt.payload['title'] === 'string'
          ? attempt.payload['title']
          : 'VERSYS alert';
      const body =
        typeof attempt.payload['body'] === 'string'
          ? attempt.payload['body']
          : '';
      fallback.attemptCount += 1;
      const result = await this.channels.sendSms({
        toE164: user.phoneE164,
        body: `VERSYS: ${title} — ${body}`.slice(0, 160),
        correlationId: fallback.eventKey,
        idempotencyKey: fallback.eventKey,
        purpose: 'alert',
      });

      if (result.ok) {
        fallback.status = 'sent';
        fallback.sentAt = new Date();
        fallback.providerMessageId = result.providerMessageId ?? null;
        fallback.lastError = null;
      } else if (fallback.attemptCount >= this.fallbackMaxAttempts) {
        fallback.status = 'dead';
        fallback.lastError = (result.error ?? 'sms_failed').slice(0, 512);
      } else {
        fallback.lastError = (result.error ?? 'sms_failed').slice(0, 512);
        fallback.nextAttemptAt = new Date(
          Date.now() + Math.min(60_000, 2 ** fallback.attemptCount * 1_000),
        );
      }
      await manager.getRepository(NotificationFallbackEntity).save(fallback);
    });
  }

  async repairFallbacks(): Promise<number> {
    const result = await this.dataSource.query<{ attempt_id: string }[]>(
      `
        INSERT INTO notification_fallbacks (
          attempt_id,
          event_key,
          status,
          due_at,
          next_attempt_at,
          attempt_count
        )
        SELECT
          attempt.id,
          'notification.sms-fallback.' || attempt.id,
          'pending',
          now(),
          now(),
          0
        FROM notification_attempts attempt
        LEFT JOIN incidents incident ON incident.id = attempt.incident_id
        LEFT JOIN notification_fallbacks fallback ON fallback.attempt_id = attempt.id
        WHERE attempt.status = 'sent'
          AND attempt.acked_at IS NULL
          AND attempt.template_key = 'incident_alert'
          AND attempt.created_at >= now() - ($1 * interval '1 millisecond')
          AND COALESCE(incident.is_drill, false) = false
          AND fallback.attempt_id IS NULL
        ON CONFLICT (attempt_id) DO NOTHING
        RETURNING attempt_id
      `,
      [this.fallbackMaxAgeMs],
    );
    return result.length;
  }

  async dueFallbackIds(limit = 50): Promise<string[]> {
    const rows = await this.fallbacks
      .createQueryBuilder('fallback')
      .select('fallback.attempt_id', 'attemptId')
      .where('fallback.status = :status', { status: 'pending' })
      .andWhere('fallback.next_attempt_at <= :now', { now: new Date() })
      .orderBy('fallback.next_attempt_at', 'ASC')
      .take(limit)
      .getRawMany<{ attemptId: string }>();
    return rows.map((row) => row.attemptId);
  }

  private async scheduleFallback(attemptId: string): Promise<void> {
    try {
      await this.notifyQueue.add(
        'sms_fallback',
        { attemptId },
        {
          jobId: fallbackJobId(attemptId),
          delay: this.ackTimeoutMs,
          removeOnComplete: true,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Fallback queueing deferred ${attemptId}: ${message}`);
    }
  }

  private lockAttempt(
    manager: EntityManager,
    attemptId: string,
  ): Promise<NotificationAttemptEntity | null> {
    return manager
      .getRepository(NotificationAttemptEntity)
      .createQueryBuilder('attempt')
      .setLock('pessimistic_write')
      .where('attempt.id = :attemptId', { attemptId })
      .getOne();
  }

  private lockFallback(
    manager: EntityManager,
    attemptId: string,
  ): Promise<NotificationFallbackEntity | null> {
    return manager
      .getRepository(NotificationFallbackEntity)
      .createQueryBuilder('fallback')
      .setLock('pessimistic_write')
      .where('fallback.attempt_id = :attemptId', { attemptId })
      .getOne();
  }

  private async insertFallback(
    manager: EntityManager,
    attempt: NotificationAttemptEntity,
    status: 'pending' | 'cancelled',
    dueAt: Date,
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO notification_fallbacks (
          attempt_id,
          event_key,
          status,
          due_at,
          next_attempt_at,
          attempt_count,
          cancelled_at
        )
        VALUES ($1, $2, $3, $4, $4, 0, $5)
        ON CONFLICT (attempt_id) DO NOTHING
      `,
      [
        attempt.id,
        `notification.sms-fallback.${attempt.id}`,
        status,
        dueAt,
        status === 'cancelled' ? new Date() : null,
      ],
    );
  }

  private async isDrill(
    incidentId: string | null,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (!incidentId) return false;
    const repo = manager?.getRepository(IncidentEntity) ?? this.incidents;
    const incident = await repo.findOne({
      where: { id: incidentId },
      select: { id: true, isDrill: true },
    });
    return incident?.isDrill === true;
  }
}

function fallbackJobId(attemptId: string): string {
  return `sms_fallback-${attemptId}`;
}
