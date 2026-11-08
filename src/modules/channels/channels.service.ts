import { Inject, Injectable } from '@nestjs/common';
import {
  MESSAGING_PROVIDER,
  type MessagingProvider,
  type OutboundSms,
} from './providers/messaging-provider.interface';

@Injectable()
export class ChannelsService {
  constructor(
    @Inject(MESSAGING_PROVIDER) private readonly messaging: MessagingProvider,
  ) {}

  sendSms(message: OutboundSms) {
    return this.messaging.sendSms(message);
  }
}
