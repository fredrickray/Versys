import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrincipalModule } from '../auth/principal.module';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { RealtimeAccessService } from './realtime-access.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { RealtimeSubscriberService } from './realtime-subscriber.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IncidentEntity, AssignmentEntity]),
    PrincipalModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),
      }),
    }),
  ],
  providers: [
    RealtimeService,
    RealtimeAccessService,
    RealtimeGateway,
    RealtimeSubscriberService,
  ],
  exports: [RealtimeService, RealtimeGateway],
})
export class RealtimeModule {}
