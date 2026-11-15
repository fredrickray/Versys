import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { EscalationDeadlineEntity } from '../escalation/entities/escalation-deadline.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { RealtimeOutboxModule } from '../realtime/realtime-outbox.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentEntity } from './entities/assignment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssignmentEntity,
      IncidentEntity,
      EscalationDeadlineEntity,
    ]),
    AuditModule,
    RealtimeOutboxModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService, TypeOrmModule],
})
export class AssignmentsModule {}
