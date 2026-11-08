import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertLevel, NotificationChannel } from '../../common/enums';
import { NotificationAttemptEntity } from './entities/notification-attempt.entity';
import { FcmProvider } from './providers/fcm.provider';

type NotifyTargetsPayload = {
  incidentId: string;
  userIds: string[];
  alertLevel: AlertLevel;
  publicCode: string;
  type: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationAttemptEntity)
    private readonly attempts: Repository<NotificationAttemptEntity>,
    private readonly fcm: FcmProvider,
  ) {}

  @OnEvent('incident.notify_targets')
  async onIncidentNotify(payload: NotifyTargetsPayload): Promise<void> {
    const high = payload.alertLevel >= AlertLevel.HIGH;
    const title = high ? 'HIGH emergency' : 'Emergency alert';
    const body = `${payload.type} · ${payload.publicCode}`;

    for (const userId of payload.userIds) {
      const attempt = await this.attempts.save(
        this.attempts.create({
          userId,
          incidentId: payload.incidentId,
          channel: NotificationChannel.FCM,
          templateKey: 'incident_alert',
          status: 'pending',
          payload: { title, body, alertLevel: payload.alertLevel },
        }),
      );

      const result = await this.fcm.send({
        userId,
        title,
        body,
        highPriority: high,
        data: {
          incidentId: payload.incidentId,
          publicCode: payload.publicCode,
          alertLevel: String(payload.alertLevel),
        },
      });

      attempt.status = result.ok ? 'sent' : 'failed';
      await this.attempts.save(attempt);
    }

    this.logger.log(
      `Notified ${payload.userIds.length} users for ${payload.publicCode}`,
    );
  }
}
