import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { LocationPingEntity } from '../location/entities/location-ping.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IncidentEntity,
      AssignmentEntity,
      LocationPingEntity,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
