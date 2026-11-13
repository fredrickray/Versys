import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelSimulatorGuard } from '../../common/guards/channel-simulator.guard';
import { WebhookRateLimitGuard } from '../../common/guards/webhook-rate-limit.guard';
import { WebhookSecretGuard } from '../../common/guards/webhook-secret.guard';
import { IncidentsModule } from '../incidents/incidents.module';
import { PlacesModule } from '../places/places.module';
import { ChannelsService } from './channels.service';
import { InboundRequestEntity } from './entities/inbound-request.entity';
import { InboundIdempotencyService } from './inbound-idempotency.service';
import { AggregatorMessagingProvider } from './providers/aggregator.provider';
import { MESSAGING_PROVIDER } from './providers/messaging-provider.interface';
import { MockMessagingProvider } from './providers/mock.provider';
import { TermiiMessagingProvider } from './providers/termii.provider';
import { SmsController } from './sms/sms.controller';
import { UssdController } from './ussd/ussd.controller';
import { UssdService } from './ussd/ussd.service';
import { UssdSessionService } from './ussd/ussd-session.service';

@Module({
  imports: [
    IncidentsModule,
    PlacesModule,
    TypeOrmModule.forFeature([InboundRequestEntity]),
  ],
  controllers: [UssdController, SmsController],
  providers: [
    ChannelSimulatorGuard,
    WebhookSecretGuard,
    WebhookRateLimitGuard,
    ChannelsService,
    InboundIdempotencyService,
    MockMessagingProvider,
    TermiiMessagingProvider,
    AggregatorMessagingProvider,
    UssdSessionService,
    UssdService,
    {
      provide: MESSAGING_PROVIDER,
      inject: [
        ConfigService,
        MockMessagingProvider,
        TermiiMessagingProvider,
        AggregatorMessagingProvider,
      ],
      useFactory: (
        config: ConfigService,
        mock: MockMessagingProvider,
        termii: TermiiMessagingProvider,
        aggregator: AggregatorMessagingProvider,
      ) => {
        const provider = config.get<string>('smsProvider');
        if (provider === 'termii') return termii;
        if (provider === 'aggregator') return aggregator;
        return mock;
      },
    },
  ],
  exports: [ChannelsService],
})
export class ChannelsModule {}
