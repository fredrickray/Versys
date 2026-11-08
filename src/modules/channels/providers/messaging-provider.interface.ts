export type OutboundSmsPurpose = 'otp' | 'alert' | 'general';

export type OutboundSms = {
  toE164: string;
  body: string;
  correlationId?: string;
  /** Influences aggregator channel (e.g. Termii DND for OTP). */
  purpose?: OutboundSmsPurpose;
};

export type OutboundSmsResult = {
  ok: boolean;
  providerMessageId?: string;
  mock?: boolean;
  error?: string;
};

export interface MessagingProvider {
  sendSms(message: OutboundSms): Promise<OutboundSmsResult>;
}

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
