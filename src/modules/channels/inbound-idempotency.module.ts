import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboundRequestEntity } from './entities/inbound-request.entity';
import { InboundIdempotencyService } from './inbound-idempotency.service';

@Module({
  imports: [TypeOrmModule.forFeature([InboundRequestEntity])],
  providers: [InboundIdempotencyService],
  exports: [InboundIdempotencyService, TypeOrmModule],
})
export class InboundIdempotencyModule {}
