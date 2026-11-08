import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PushMessage = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  highPriority?: boolean;
  /** Client: play phone alarm + vibrate (high / unattended). */
  alarm?: boolean;
  vibrate?: boolean;
  /** Blinking blue announcement affordance. */
  blinkingBlue?: boolean;
};

@Injectable()
export class FcmProvider {
  private readonly logger = new Logger(FcmProvider.name);

  constructor(private readonly config: ConfigService) {}

  send(message: PushMessage): Promise<{ ok: boolean; mock: boolean }> {
    const enriched: PushMessage = {
      ...message,
      data: {
        ...(message.data ?? {}),
        alarm: message.alarm ? '1' : '0',
        vibrate: message.vibrate ? '1' : '0',
        blinkingBlue: message.blinkingBlue ? '1' : '0',
      },
    };

    if (!this.config.get<boolean>('fcmEnabled')) {
      this.logger.debug(
        `mock FCM → user=${enriched.userId} title=${enriched.title} alarm=${enriched.data?.alarm}`,
      );
      return Promise.resolve({ ok: true, mock: true });
    }
    this.logger.warn(
      'FCM enabled but credentials not wired — treating as mock',
    );
    return Promise.resolve({ ok: true, mock: true });
  }
}
