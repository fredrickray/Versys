import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName } from '../../../queues/queue-names';
import { EscalationService } from '../escalation.service';

type PromptJob = { incidentId: string; assignmentId: string };
type AutoJob = { incidentId: string };

/**
 * lockDuration > typical reconcile work so Nest --watch restarts do not
 * expire the token mid-job. Still expect occasional "Missing lock" noise
 * when the old process is killed; those are logged as warnings below.
 */
@Processor(QueueName.ESCALATION, {
  concurrency: 1,
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 5,
})
export class EscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationProcessor.name);

  constructor(private readonly escalation: EscalationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'prompt': {
        const data = job.data as PromptJob;
        await this.escalation.issuePrompt(data.incidentId, data.assignmentId);
        return;
      }
      case 'auto_escalate': {
        const data = job.data as AutoJob;
        await this.escalation.autoEscalate(data.incidentId);
        return;
      }
      case 'reconcile': {
        await this.escalation.reconcile();
        return;
      }
      default:
        this.logger.warn(`Unknown escalation job ${job.name}`);
    }
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    if (error.message?.includes('Missing lock')) {
      this.logger.warn(
        `Stale BullMQ lock (usually Nest --watch restart): ${error.message}`,
      );
      return;
    }
    this.logger.error(error.message, error.stack);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Escalation job stalled: ${jobId}`);
  }
}
