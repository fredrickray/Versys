import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { DevicesService } from '../../devices/devices.service';

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

export type PushResult = {
  ok: boolean;
  mock: boolean;
  successCount?: number;
  failureCount?: number;
};

@Injectable()
export class FcmProvider implements OnModuleInit {
  private readonly logger = new Logger(FcmProvider.name);
  private messaging: Messaging | null = null;
  private initAttempted = false;

  constructor(
    private readonly config: ConfigService,
    private readonly devices: DevicesService,
  ) {}

  onModuleInit(): void {
    this.ensureClient();
  }

  private ensureClient(): Messaging | null {
    if (this.messaging) return this.messaging;
    if (this.initAttempted) return null;
    this.initAttempted = true;

    if (!this.config.get<boolean>('fcmEnabled')) {
      this.logger.log('FCM disabled — pushes stay mocked');
      return null;
    }

    const projectId = this.config.get<string>('firebase.projectId')?.trim();
    const clientEmail = this.config.get<string>('firebase.clientEmail')?.trim();
    const privateKeyRaw = this.config.get<string>('firebase.privateKey') ?? '';
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n').trim();

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'FCM_ENABLED but FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY incomplete — mock only',
      );
      return null;
    }

    try {
      let app: App;
      if (getApps().length === 0) {
        app = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
          projectId,
        });
      } else {
        app = getApps()[0]!;
      }
      this.messaging = getMessaging(app);
      this.logger.log(`FCM Admin ready (project=${projectId})`);
      return this.messaging;
    } catch (err) {
      this.logger.error(
        `FCM Admin init failed — mock only: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async send(message: PushMessage): Promise<PushResult> {
    const data: Record<string, string> = {
      ...(message.data ?? {}),
      alarm: message.alarm ? '1' : '0',
      vibrate: message.vibrate ? '1' : '0',
      blinkingBlue: message.blinkingBlue ? '1' : '0',
    };

    const messaging = this.ensureClient();
    if (!messaging) {
      this.logger.debug(
        `mock FCM → user=${message.userId} title=${message.title} alarm=${data.alarm}`,
      );
      return { ok: true, mock: true };
    }

    const rows = await this.devices.findTokensForUser(message.userId);
    if (!rows.length) {
      this.logger.warn(
        `FCM skip — no device tokens for user=${message.userId}`,
      );
      return { ok: false, mock: false, successCount: 0, failureCount: 0 };
    }

    const tokens = rows.map((r) => r.token);
    const high = !!message.highPriority || !!message.alarm;

    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: message.title,
          body: message.body,
        },
        data,
        android: {
          priority: high ? 'high' : 'normal',
          notification: {
            channelId: high ? 'versys_alarm' : 'versys_default',
            sound: high ? 'default' : undefined,
            priority: high ? 'max' : 'default',
          },
        },
        apns: {
          headers: {
            'apns-priority': high ? '10' : '5',
          },
          payload: {
            aps: {
              sound: high ? 'default' : undefined,
              contentAvailable: true,
            },
          },
        },
      });

      const dead: string[] = [];
      response.responses.forEach((res, i) => {
        if (res.success) return;
        const code = res.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          dead.push(tokens[i]);
        } else {
          this.logger.warn(
            `FCM fail token=${tokens[i]?.slice(0, 12)}… code=${code} msg=${res.error?.message}`,
          );
        }
      });
      if (dead.length) await this.devices.removeTokens(dead);

      const ok = response.successCount > 0;
      return {
        ok,
        mock: false,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (err) {
      this.logger.error(
        `FCM send failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { ok: false, mock: false };
    }
  }
}
