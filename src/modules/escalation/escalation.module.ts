import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EscalationEventEntity } from './entities/escalation-event.entity';
import { EscalationMachine } from './state-machine/escalation.machine';
import { EscalationService } from './escalation.service';

@Module({
  imports: [TypeOrmModule.forFeature([EscalationEventEntity])],
  providers: [EscalationService, EscalationMachine],
  exports: [EscalationService, EscalationMachine],
})
export class EscalationModule {}
