import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MessagingProvider,
  OutboundSms,
  OutboundSmsResult,
} from './messaging-provider.interface';
import { toAggregatorMsisdn } from './phone.util';

type TermiiSendResponse = {
  message_id?: string;
  messageId?: string;
  code?: string | number;
  message?: string;
};

/**
 * Termii SMS — Nigeria-friendly OTP/alert delivery.
 * Docs: https://developers.termii.com/messaging
 */
@Injectable()
export class TermiiMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(TermiiMessagingProvider.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(message: OutboundSms): Promise<OutboundSmsResult> {
    const apiKey = this.config.get<string>('sms.termii.apiKey')?.trim() ?? '';
    const senderId =
      this.config.get<string>('sms.termii.senderId')?.trim() ?? '';
    const baseUrl =
      this.config.get<string>('sms.termii.baseUrl')?.replace(/\/$/, '') ??
      'https://api.ng.termii.com';

    if (!apiKey || !senderId) {
      this.logger.error(
        'Termii not configured — set SMS_TERMII_API_KEY and SMS_TERMII_SENDER_ID',
      );
      return { ok: false, error: 'termii_not_configured' };
    }

    const to = toAggregatorMsisdn(message.toE164);
    const channel =
      message.purpose === 'otp'
        ? (this.config.get<string>('sms.termii.otpChannel') ?? 'dnd')
        : (this.config.get<string>('sms.termii.alertChannel') ?? 'generic');

    const url = `${baseUrl}/api/sms/send`;
    const payload = {
      to,
      from: senderId,
      sms: message.body,
      type: 'plain',
      channel,
      api_key: apiKey,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = (await res.json().catch(() => ({}))) as TermiiSendResponse;
      if (!res.ok) {
        this.logger.warn(
          `Termii HTTP ${res.status} to=${to} body=${JSON.stringify(raw)}`,
        );
        return {
          ok: false,
          error: raw.message ?? `termii_http_${res.status}`,
        };
      }

      const providerMessageId = raw.message_id ?? raw.messageId;
      this.logger.log(
        `Termii SMS ok to=${to} id=${providerMessageId ?? 'n/a'} purpose=${message.purpose ?? 'general'}`,
      );
      return { ok: true, providerMessageId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Termii SMS failed to=${to}: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
