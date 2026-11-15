import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { AuditModule } from '../audit/audit.module';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { UserEntity } from '../users/entities/user.entity';
import { LocationPingEntity } from './entities/location-ping.entity';
import { StaffShiftEntity } from './entities/staff-shift.entity';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { StaffShiftService } from './staff-shift.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LocationPingEntity,
      StaffShiftEntity,
      IncidentEntity,
      AssignmentEntity,
      UserEntity,
    ]),
    AuditModule,
  ],
  controllers: [LocationController],
  providers: [LocationService, StaffShiftService],
  exports: [LocationService, StaffShiftService],
})
export class LocationModule {}
