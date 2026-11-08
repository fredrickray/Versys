import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { AlertLevel, NotificationChannel } from '../../common/enums';
import { QueueName } from '../../queues/queue-names';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';
import { NotificationAttemptEntity } from './entities/notification-attempt.entity';
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
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly ackTimeoutMs = 45_000;

  constructor(
    @InjectRepository(NotificationAttemptEntity)
    private readonly attempts: Repository<NotificationAttemptEntity>,
    private readonly fcm: FcmProvider,
    private readonly channels: ChannelsService,
    private readonly users: UsersService,
    @InjectQueue(QueueName.NOTIFICATIONS) private readonly notifyQueue: Queue,
  ) {}

  @OnEvent('incident.notify_targets')
  async onIncidentNotify(payload: NotifyTargetsPayload): Promise<void> {
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
      const attempt = await this.attempts.save(
        this.attempts.create({
          userId,
          incidentId: payload.incidentId,
          channel: NotificationChannel.FCM,
          templateKey: payload.blinkingBlue ? 'announcement' : 'incident_alert',
          status: 'pending',
          payload: {
            title,
            body,
            alertLevel: payload.alertLevel,
            announcementId: payload.announcementId ?? null,
          },
        }),
      );

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

      attempt.status = result.ok ? 'sent' : 'failed';
      await this.attempts.save(attempt);

      if (result.ok && !payload.blinkingBlue) {
        await this.notifyQueue.add(
          'sms_fallback',
          { attemptId: attempt.id },
          {
            // BullMQ custom jobId cannot contain ':'
            jobId: `sms_fallback-${attempt.id}`,
            delay: this.ackTimeoutMs,
            removeOnComplete: true,
          },
        );
      }
    }

    this.logger.log(
      `Notified ${payload.userIds.length} users for ${payload.publicCode}`,
    );
  }

  async ack(attemptId: string, userId: string): Promise<{ ok: true }> {
    const attempt = await this.attempts.findOne({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('notification_not_found');
    if (attempt.userId !== userId)
      throw new NotFoundException('notification_not_found');
    attempt.status = 'acked';
    attempt.ackedAt = new Date();
    await this.attempts.save(attempt);

    const job = await this.notifyQueue.getJob(`sms_fallback-${attemptId}`);
    if (job) await job.remove();
    return { ok: true };
  }

  async sendSmsFallback(attemptId: string): Promise<void> {
    const attempt = await this.attempts.findOne({ where: { id: attemptId } });
    if (!attempt) return;
    if (attempt.status === 'acked' || attempt.status === 'fallback_sms') return;

    const user = await this.users.findById(attempt.userId);
    if (!user?.phoneE164) {
      this.logger.warn(`SMS fallback skipped — no phone for ${attempt.userId}`);
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
    const result = await this.channels.sendSms({
      toE164: user.phoneE164,
      body: `VERSYS: ${title} — ${body}`.slice(0, 160),
      correlationId: attempt.id,
      purpose: 'alert',
    });

    attempt.status = result.ok ? 'fallback_sms' : 'failed';
    attempt.channel = NotificationChannel.SMS;
    await this.attempts.save(attempt);
  }
}
