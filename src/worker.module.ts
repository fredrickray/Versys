import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { LocationModule } from './modules/location/location.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    QueuesModule,
    EscalationModule,
    NotificationsModule,
    LocationModule,
    AuditModule,
  ],
})
export class WorkerModule {}
