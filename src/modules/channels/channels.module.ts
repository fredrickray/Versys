import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelsService } from './channels.service';
import { AggregatorMessagingProvider } from './providers/aggregator.provider';
import { MESSAGING_PROVIDER } from './providers/messaging-provider.interface';
import { MockMessagingProvider } from './providers/mock.provider';

@Module({
  providers: [
    ChannelsService,
    MockMessagingProvider,
    AggregatorMessagingProvider,
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
