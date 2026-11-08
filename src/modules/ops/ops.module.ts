import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [TypeOrmModule.forFeature([IncidentEntity])],
  controllers: [OpsController],
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
