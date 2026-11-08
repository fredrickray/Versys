import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { AuditController } from './audit.controller';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { FalseAlarmService } from './false-alarm.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity, IncidentEntity])],
  controllers: [AuditController],
  providers: [AuditService, FalseAlarmService],
  exports: [AuditService],
})
export class AuditModule {}
