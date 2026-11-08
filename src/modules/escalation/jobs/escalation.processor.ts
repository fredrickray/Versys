import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName } from '../../../queues/queue-names';
import { EscalationService } from '../escalation.service';

type PromptJob = { incidentId: string; assignmentId: string };
type AutoJob = { incidentId: string };

@Processor(QueueName.ESCALATION)
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
}
