import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class NotificationFallbackRecovery
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationFallbackRecovery.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly notifications: NotificationsService) {}

  async onModuleInit(): Promise<void> {
    await this.run();
    this.timer = setInterval(() => {
      void this.run();
    }, 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.notifications.repairFallbacks();
      const due = await this.notifications.dueFallbackIds();
      for (const attemptId of due) {
        await this.notifications.sendSmsFallback(attemptId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Notification fallback recovery failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
