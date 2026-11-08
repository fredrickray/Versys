import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncidentsModule } from '../incidents/incidents.module';
import { PlacesModule } from '../places/places.module';
import { ChannelsService } from './channels.service';
import { AggregatorMessagingProvider } from './providers/aggregator.provider';
import { MESSAGING_PROVIDER } from './providers/messaging-provider.interface';
import { MockMessagingProvider } from './providers/mock.provider';
import { SmsController } from './sms/sms.controller';
import { UssdController } from './ussd/ussd.controller';
import { UssdService } from './ussd/ussd.service';
import { UssdSessionService } from './ussd/ussd-session.service';

@Module({
  imports: [IncidentsModule, PlacesModule],
  controllers: [UssdController, SmsController],
  providers: [
    ChannelsService,
    MockMessagingProvider,
    AggregatorMessagingProvider,
    UssdSessionService,
    UssdService,
    {
      provide: MESSAGING_PROVIDER,
      inject: [
        ConfigService,
        MockMessagingProvider,
        AggregatorMessagingProvider,
      ],
      useFactory: (
        config: ConfigService,
        mock: MockMessagingProvider,
        aggregator: AggregatorMessagingProvider,
      ) =>
        config.get<string>('smsProvider') === 'aggregator' ? aggregator : mock,
    },
  ],
  exports: [ChannelsService],
})
export class ChannelsModule {}
