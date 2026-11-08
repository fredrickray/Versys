import { Injectable, Logger } from '@nestjs/common';
import type {
  MessagingProvider,
  OutboundSms,
  OutboundSmsResult,
} from './messaging-provider.interface';

/**
 * Legacy placeholder name — prefer SMS_PROVIDER=termii.
 * Kept so older env values don't crash; always fails closed.
 */
@Injectable()
export class AggregatorMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(AggregatorMessagingProvider.name);

  sendSms(message: OutboundSms): Promise<OutboundSmsResult> {
    this.logger.warn(
      `SMS_PROVIDER=aggregator is deprecated — use termii. Dropping SMS to ${message.toE164}`,
    );
    return Promise.resolve({
      ok: false,
      error: 'aggregator_deprecated_use_termii',
    });
  }
}
