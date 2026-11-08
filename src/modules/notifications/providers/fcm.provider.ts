import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PushMessage = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  highPriority?: boolean;
};

@Injectable()
export class FcmProvider {
  private readonly logger = new Logger(FcmProvider.name);

  constructor(private readonly config: ConfigService) {}

  send(message: PushMessage): Promise<{ ok: boolean; mock: boolean }> {
    if (!this.config.get<boolean>('fcmEnabled')) {
      this.logger.debug(
        `mock FCM → user=${message.userId} title=${message.title} high=${!!message.highPriority}`,
      );
      return Promise.resolve({ ok: true, mock: true });
    }
    // Real FCM credentials land when Firebase project is provisioned.
    this.logger.warn(
      'FCM enabled but credentials not wired — treating as mock',
    );
    return Promise.resolve({ ok: true, mock: true });
  }
}
