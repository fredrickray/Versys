import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesModule } from '../../queues/queues.module';
import { LocationModule } from './location.module';
import { LocationPingEntity } from './entities/location-ping.entity';
import { LocationContextRecovery } from './jobs/location-context.recovery';
import { LocationRetentionService } from './jobs/retention.job';
import { LocationRetentionProcessor } from './jobs/retention.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocationPingEntity]),
    QueuesModule,
    LocationModule,
  ],
  providers: [
    LocationRetentionService,
    LocationRetentionProcessor,
    LocationContextRecovery,
  ],
})
export class LocationJobsModule {}
