import { Injectable, Logger } from '@nestjs/common';
import type {
  MessagingProvider,
  OutboundSms,
  OutboundSmsResult,
} from './messaging-provider.interface';

/** Swap-in when telecom aggregator is chosen. */
@Injectable()
export class AggregatorMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(AggregatorMessagingProvider.name);

  sendSms(message: OutboundSms): Promise<OutboundSmsResult> {
    this.logger.warn(
      `aggregator SMS not configured — dropping to ${message.toE164}`,
    );
    return Promise.resolve({ ok: false });
  }
}
