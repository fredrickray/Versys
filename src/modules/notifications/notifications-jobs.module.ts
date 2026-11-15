import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { NotificationIntentProcessor } from './jobs/notification-intent.processor';
import { NotificationFallbackRecovery } from './jobs/notification-fallback.recovery';
import { NotifyProcessor } from './jobs/notify.processor';
import { NotificationIntentModule } from './notification-intent.module';
import { NotificationsModule } from './notifications.module';

@Module({
  imports: [NotificationsModule, NotificationIntentModule, IncidentsModule],
  providers: [
    NotifyProcessor,
    NotificationFallbackRecovery,
    NotificationIntentProcessor,
  ],
})
export class NotificationsJobsModule {}
