import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesModule } from '../../queues/queues.module';
import { LocationPingEntity } from './entities/location-ping.entity';
import { LocationRetentionService } from './jobs/retention.job';
import { LocationRetentionProcessor } from './jobs/retention.processor';

@Module({
  imports: [TypeOrmModule.forFeature([LocationPingEntity]), QueuesModule],
  providers: [LocationRetentionService, LocationRetentionProcessor],
})
export class LocationJobsModule {}
