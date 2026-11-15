import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationIntentEntity } from './entities/notification-intent.entity';
import { NotificationIntentService } from './notification-intent.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationIntentEntity])],
  providers: [NotificationIntentService],
  exports: [NotificationIntentService, TypeOrmModule],
})
export class NotificationIntentModule {}
