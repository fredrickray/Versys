import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { EscalationJobsModule } from './modules/escalation/escalation-jobs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { NotificationsJobsModule } from './modules/notifications/notifications-jobs.module';
import { LocationModule } from './modules/location/location.module';
import { AuditModule } from './modules/audit/audit.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { UsersModule } from './modules/users/users.module';
import { PlacesModule } from './modules/places/places.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { IncidentsJobsModule } from './modules/incidents/incidents-jobs.module';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),
    DatabaseModule,
    RedisModule,
    QueuesModule,
    UsersModule,
    PlacesModule,
    AuditModule,
    ChannelsModule,
    EscalationModule,
    EscalationJobsModule,
    NotificationsModule,
    NotificationsJobsModule,
    LocationModule,
    IncidentsModule,
    IncidentsJobsModule,
  ],
})
export class WorkerModule {}
