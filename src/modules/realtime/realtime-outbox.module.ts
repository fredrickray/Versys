import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeOutboxEntity } from './entities/realtime-outbox.entity';
import { RealtimeOutboxService } from './realtime-outbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([RealtimeOutboxEntity])],
  providers: [RealtimeOutboxService],
  exports: [RealtimeOutboxService, TypeOrmModule],
})
export class RealtimeOutboxModule {}
