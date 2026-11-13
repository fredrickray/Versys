import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { MaintenanceMiddleware } from './common/middleware/maintenance.middleware';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { AuditModule } from './modules/audit/audit.module';
import { LocationModule } from './modules/location/location.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PlacesModule } from './modules/places/places.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { OpsModule } from './modules/ops/ops.module';
import { DevicesModule } from './modules/devices/devices.module';
import { MediaModule } from './modules/media/media.module';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),
    DatabaseModule,
    RedisModule,
    QueuesModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RbacModule,
    DevicesModule,
    IncidentsModule,
    AssignmentsModule,
    EscalationModule,
    DispatchModule,
    AnnouncementsModule,
    AuditModule,
    LocationModule,
    NotificationsModule,
    ChannelsModule,
    AnalyticsModule,
    PlacesModule,
    RealtimeModule,
    OpsModule,
    MediaModule,
  ],
  providers: [MaintenanceMiddleware],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MaintenanceMiddleware).forRoutes('*');
  }
}
