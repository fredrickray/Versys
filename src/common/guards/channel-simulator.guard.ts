import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Blocks inbound routes if a live provider adapter has not been approved. */
@Injectable()
export class ChannelSimulatorGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!this.config.get<boolean>('channelSimulatorOnly')) {
      throw new NotFoundException('channel_simulator_disabled');
    }
    return true;
  }
}
