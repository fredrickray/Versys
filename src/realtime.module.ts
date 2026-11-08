import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { RealtimeModule as RealtimeFeatureModule } from './modules/realtime/realtime.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    NotificationsModule,
    RealtimeFeatureModule,
  ],
})
export class RealtimeAppModule {}
