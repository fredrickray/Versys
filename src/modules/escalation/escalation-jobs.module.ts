import { Module } from '@nestjs/common';
import { EscalationModule } from './escalation.module';
import { EscalationProcessor } from './jobs/escalation.processor';
import { ReconcilerBootstrap } from './jobs/reconciler.bootstrap';

/** Worker-only: BullMQ consumers for escalation timers / reconciler. */
@Module({
  imports: [EscalationModule],
  providers: [EscalationProcessor, ReconcilerBootstrap],
})
export class EscalationJobsModule {}
