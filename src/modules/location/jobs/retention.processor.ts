import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName } from '../../../queues/queue-names';
import { LocationRetentionService } from './retention.job';

@Processor(QueueName.LOCATION_RETENTION)
export class LocationRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(LocationRetentionProcessor.name);

  constructor(private readonly retention: LocationRetentionService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'purge') {
      this.logger.warn(`Unknown retention job ${job.name}`);
      return;
    }
    await this.retention.purge();
  }
}
