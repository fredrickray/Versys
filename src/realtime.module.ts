import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { RealtimeModule as RealtimeFeatureModule } from './modules/realtime/realtime.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    HealthModule,
    RealtimeFeatureModule,
  ],
})
export class RealtimeAppModule {}
