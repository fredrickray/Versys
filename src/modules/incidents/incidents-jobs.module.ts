import { Module } from '@nestjs/common';
import { IncidentsModule } from './incidents.module';
import { OfflineAlertsProcessor } from './jobs/offline-alerts.processor';

@Module({
  imports: [IncidentsModule],
  providers: [OfflineAlertsProcessor],
})
export class IncidentsJobsModule {}
