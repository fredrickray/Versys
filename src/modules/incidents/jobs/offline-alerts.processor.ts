import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName } from '../../../queues/queue-names';
import type { OfflineAlertDto } from '../dto/offline-alert.dto';
import { OfflineAlertsService } from '../offline-alerts.service';

type OfflineJob = { userId: string; dto: OfflineAlertDto };

@Processor(QueueName.OFFLINE_ALERTS)
export class OfflineAlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(OfflineAlertsProcessor.name);

  constructor(private readonly offline: OfflineAlertsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'process_offline_alert') {
      this.logger.warn(`Unknown offline job ${job.name}`);
      return;
    }
    const data = job.data as OfflineJob;
    await this.offline.process(data.userId, data.dto);
  }
}
