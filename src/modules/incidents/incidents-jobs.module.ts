import { Module } from '@nestjs/common';
import { QueuesModule } from '../../queues/queues.module';
import { IncidentsModule } from './incidents.module';
import { OfflineAlertsProcessor } from './jobs/offline-alerts.processor';
import { OfflineAlertsRecovery } from './jobs/offline-alerts.recovery';

@Module({
  imports: [IncidentsModule, QueuesModule],
  providers: [OfflineAlertsProcessor, OfflineAlertsRecovery],
})
export class IncidentsJobsModule {}
