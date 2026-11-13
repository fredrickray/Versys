import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesModule } from '../../queues/queues.module';
import { AuditModule } from '../audit/audit.module';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { RealtimeOutboxModule } from '../realtime/realtime-outbox.module';
import { UsersModule } from '../users/users.module';
import { IncidentEntity } from './entities/incident.entity';
import { IncidentsController } from './incidents.controller';
import { VisitorIncidentsController } from './visitor-incidents.controller';
import { IncidentsService } from './incidents.service';
import { OfflineAlertsService } from './offline-alerts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IncidentEntity, AssignmentEntity]),
    UsersModule,
    AuditModule,
    RealtimeOutboxModule,
    QueuesModule,
  ],
  controllers: [IncidentsController, VisitorIncidentsController],
  providers: [IncidentsService, OfflineAlertsService],
  exports: [IncidentsService, OfflineAlertsService, TypeOrmModule],
})
export class IncidentsModule {}
