import { Injectable, OnModuleInit } from '@nestjs/common';
import { EscalationScheduler } from '../escalation.scheduler';

@Injectable()
export class ReconcilerBootstrap implements OnModuleInit {
  constructor(private readonly scheduler: EscalationScheduler) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.registerReconciler();
  }
}
