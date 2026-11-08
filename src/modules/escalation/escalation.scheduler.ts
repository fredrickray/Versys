import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ESCALATION_TIMERS } from '../../common/constants/escalation';
import { QueueName } from '../../queues/queue-names';

@Injectable()
export class EscalationScheduler {
  private readonly logger = new Logger(EscalationScheduler.name);

  constructor(
    @InjectQueue(QueueName.ESCALATION) private readonly queue: Queue,
  ) {}

  async registerReconciler(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'escalation-reconciler',
      { every: ESCALATION_TIMERS.RECONCILER_INTERVAL_MS },
      {
        name: 'reconcile',
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log('Escalation reconciler registered');
  }

  async schedulePrompt(
    incidentId: string,
    assignmentId: string,
  ): Promise<void> {
    await this.queue.add(
      'prompt',
      { incidentId, assignmentId },
      {
        jobId: `prompt:${incidentId}`,
        delay: ESCALATION_TIMERS.PROMPT_AFTER_MS,
        removeOnComplete: true,
      },
    );
  }

  async scheduleAutoEscalate(incidentId: string): Promise<void> {
    await this.queue.add(
      'auto_escalate',
      { incidentId },
      {
        jobId: `auto:${incidentId}`,
        delay: ESCALATION_TIMERS.AUTO_ESCALATE_AFTER_PROMPT_MS,
        removeOnComplete: true,
      },
    );
  }

  async cancelForIncident(incidentId: string): Promise<void> {
    for (const id of [`prompt:${incidentId}`, `auto:${incidentId}`]) {
      const job = await this.queue.getJob(id);
      if (job) await job.remove();
    }
  }
}
