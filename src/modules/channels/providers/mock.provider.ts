import { Injectable, Logger } from '@nestjs/common';
import type {
  MessagingProvider,
  OutboundSms,
  OutboundSmsResult,
} from './messaging-provider.interface';

@Injectable()
export class MockMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(MockMessagingProvider.name);
  private readonly deliveries = new Map<string, OutboundSmsResult>();

  deliveryCount(idempotencyKey: string): number {
    return this.deliveries.has(idempotencyKey) ? 1 : 0;
  }

  sendSms(message: OutboundSms): Promise<OutboundSmsResult> {
    if (message.idempotencyKey) {
      const existing = this.deliveries.get(message.idempotencyKey);
      if (existing) return Promise.resolve(existing);
    }
    this.logger.log(
      `mock SMS → ${message.toE164} purpose=${message.purpose ?? 'general'}`,
    );
    const result: OutboundSmsResult = {
      ok: true,
      mock: true,
      providerMessageId: `mock-${Date.now()}`,
    };
    if (message.idempotencyKey) {
      this.deliveries.set(message.idempotencyKey, result);
    }
    return Promise.resolve(result);
  }
}
