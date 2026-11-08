import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationAttemptEntity } from './entities/notification-attempt.entity';
import { NotificationsService } from './notifications.service';
import { FcmProvider } from './providers/fcm.provider';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationAttemptEntity])],
  providers: [NotificationsService, FcmProvider],
  exports: [NotificationsService, FcmProvider],
})
export class NotificationsModule {}
