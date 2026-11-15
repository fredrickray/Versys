import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EscalationScheduler } from '../escalation.scheduler';
import { EscalationService } from '../escalation.service';

@Injectable()
export class ReconcilerBootstrap implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private reconciling = false;

  constructor(
    private readonly scheduler: EscalationScheduler,
    private readonly escalation: EscalationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.registerReconciler();
    await this.run();
    this.timer = setInterval(() => {
      void this.run();
    }, this.scheduler.getTimers().RECONCILER_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      await this.escalation.reconcile();
    } finally {
      this.reconciling = false;
    }
  }
}
