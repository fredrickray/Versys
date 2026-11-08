export type OutboundSms = {
  toE164: string;
  body: string;
  correlationId?: string;
};

export type OutboundSmsResult = {
  ok: boolean;
  providerMessageId?: string;
  mock?: boolean;
};

export interface MessagingProvider {
  sendSms(message: OutboundSms): Promise<OutboundSmsResult>;
}

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
