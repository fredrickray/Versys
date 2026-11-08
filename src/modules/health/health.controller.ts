import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { RedisService } from '../../redis/redis.service';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  liveness() {
    return {
      status: 'ok',
      eventMode: this.config.get<boolean>('eventMode') === true,
      maintenanceMode: this.config.get<boolean>('maintenanceMode') === true,
    };
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        const pong = await this.redis.client.ping();
        if (pong !== 'PONG') throw new Error('redis_unreachable');
        return { redis: { status: 'up' } };
      },
    ]);
  }
}
