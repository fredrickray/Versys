import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesModule } from '../../queues/queues.module';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { AuditModule } from '../audit/audit.module';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { LocationModule } from '../location/location.module';
import { NotificationIntentModule } from '../notifications/notification-intent.module';
import { PlacesModule } from '../places/places.module';
import { RealtimeOutboxModule } from '../realtime/realtime-outbox.module';
import { EscalationDeadlineEntity } from './entities/escalation-deadline.entity';
import { EscalationEventEntity } from './entities/escalation-event.entity';
import { EscalationController } from './escalation.controller';
import { EscalationScheduler } from './escalation.scheduler';
import { EscalationService } from './escalation.service';
import { AssignmentAcceptedListener } from './listeners/assignment-accepted.listener';
import { EscalationMachine } from './state-machine/escalation.machine';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EscalationEventEntity,
      EscalationDeadlineEntity,
      IncidentEntity,
      AssignmentEntity,
    ]),
    QueuesModule,
    PlacesModule,
    AuditModule,
    RealtimeOutboxModule,
    NotificationIntentModule,
    LocationModule,
  ],
  controllers: [EscalationController],
  providers: [
    EscalationService,
    EscalationMachine,
    EscalationScheduler,
    AssignmentAcceptedListener,
  ],
  exports: [EscalationService, EscalationMachine, EscalationScheduler],
})
export class EscalationModule {}
