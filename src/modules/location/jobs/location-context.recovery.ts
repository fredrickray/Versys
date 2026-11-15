import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { StaffShiftService } from '../staff-shift.service';

@Injectable()
export class LocationContextRecovery implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocationContextRecovery.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly shifts: StaffShiftService) {}

  async onModuleInit(): Promise<void> {
    await this.run();
    this.timer = setInterval(() => {
      void this.run();
    }, 30_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.shifts.expireDue();
      await this.shifts.removeExpiredLiveLocations();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Location context recovery failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
