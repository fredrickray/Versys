import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesModule } from '../../queues/queues.module';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { IncidentEntity } from './entities/incident.entity';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { OfflineAlertsService } from './offline-alerts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IncidentEntity]),
    UsersModule,
    AuditModule,
    QueuesModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService, OfflineAlertsService],
  exports: [IncidentsService, OfflineAlertsService, TypeOrmModule],
})
export class IncidentsModule {}
