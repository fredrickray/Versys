import { Injectable, Logger } from '@nestjs/common';
import type {
  MessagingProvider,
  OutboundSms,
  OutboundSmsResult,
} from './messaging-provider.interface';

@Injectable()
export class MockMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(MockMessagingProvider.name);

  sendSms(message: OutboundSms): Promise<OutboundSmsResult> {
    this.logger.log(`mock SMS → ${message.toE164}: ${message.body}`);
    return Promise.resolve({
      ok: true,
      mock: true,
      providerMessageId: `mock-${Date.now()}`,
    });
  }
}
