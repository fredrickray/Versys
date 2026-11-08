import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesModule } from '../../queues/queues.module';
import { ChannelsModule } from '../channels/channels.module';
import { DevicesModule } from '../devices/devices.module';
import { UsersModule } from '../users/users.module';
import { NotificationAttemptEntity } from './entities/notification-attempt.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmProvider } from './providers/fcm.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationAttemptEntity]),
    QueuesModule,
    ChannelsModule,
    UsersModule,
    DevicesModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, FcmProvider],
  exports: [NotificationsService, FcmProvider],
})
export class NotificationsModule {}
