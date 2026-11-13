import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  resolveEscalationTimers,
  type EscalationTimers,
} from '../../common/constants/escalation';
import { QueueName } from '../../queues/queue-names';

@Injectable()
export class EscalationScheduler {
  private readonly logger = new Logger(EscalationScheduler.name);
  private readonly timers: EscalationTimers;

  constructor(
    @InjectQueue(QueueName.ESCALATION) private readonly queue: Queue,
    config: ConfigService,
  ) {
    const overrides =
      config.get<Partial<EscalationTimers>>('escalationTimers') ?? {};
    this.timers = resolveEscalationTimers({
      PROMPT_AFTER_MS: overrides.PROMPT_AFTER_MS,
      AUTO_ESCALATE_AFTER_PROMPT_MS: overrides.AUTO_ESCALATE_AFTER_PROMPT_MS,
      DISPATCHER_RESOLVE_AFTER_MS: overrides.DISPATCHER_RESOLVE_AFTER_MS,
      RECONCILER_INTERVAL_MS: overrides.RECONCILER_INTERVAL_MS,
    });
    this.logger.log(
      `Escalation timers prompt=${this.timers.PROMPT_AFTER_MS}ms auto=${this.timers.AUTO_ESCALATE_AFTER_PROMPT_MS}ms`,
    );
  }

  getTimers(): EscalationTimers {
    return this.timers;
  }

  async registerReconciler(): Promise<void> {
    // Prune leftovers from Nest --watch restarts (failed completions leave noise).
    try {
      await this.queue.clean(0, 1000, 'failed');
      await this.queue.clean(0, 1000, 'completed');
    } catch (err) {
      this.logger.warn(
        `Could not prune stale escalation jobs: ${(err as Error).message}`,
      );
    }

    await this.queue.upsertJobScheduler(
      'escalation-reconciler',
      { every: this.timers.RECONCILER_INTERVAL_MS },
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
        // BullMQ custom jobId cannot contain ':'
        jobId: `prompt-${incidentId}`,
        delay: this.timers.PROMPT_AFTER_MS,
        removeOnComplete: true,
      },
    );
  }

  async scheduleAutoEscalate(incidentId: string): Promise<void> {
    await this.queue.add(
      'auto_escalate',
      { incidentId },
      {
        jobId: `auto-${incidentId}`,
        delay: this.timers.AUTO_ESCALATE_AFTER_PROMPT_MS,
        removeOnComplete: true,
      },
    );
  }

  async cancelForIncident(incidentId: string): Promise<void> {
    for (const id of [`prompt-${incidentId}`, `auto-${incidentId}`]) {
      const job = await this.queue.getJob(id);
      if (job) await job.remove();
    }
  }
}
