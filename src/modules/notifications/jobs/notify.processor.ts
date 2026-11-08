import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName } from '../../../queues/queue-names';
import { NotificationsService } from '../notifications.service';

type SmsFallbackJob = { attemptId: string };

@Processor(QueueName.NOTIFICATIONS)
export class NotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyProcessor.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'sms_fallback') {
      const data = job.data as SmsFallbackJob;
      await this.notifications.sendSmsFallback(data.attemptId);
      return;
    }
    this.logger.warn(`Unknown notify job ${job.name}`);
  }
}
