import { Module } from '@nestjs/common';
import { NotifyProcessor } from './jobs/notify.processor';
import { NotificationsModule } from './notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [NotifyProcessor],
})
export class NotificationsJobsModule {}
