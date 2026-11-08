import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentStatus } from '../../common/enums';
import { RedisService } from '../../redis/redis.service';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class OpsService {
  private readonly version: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
  ) {
    this.version = this.readPackageVersion();
  }

  async deskStatus() {
    let redisOk = false;
    try {
      redisOk = (await this.redis.client.ping()) === 'PONG';
    } catch {
      redisOk = false;
    }

    const openCount = await this.incidents.count({
      where: [
        { status: IncidentStatus.REPORTED },
        { status: IncidentStatus.INTERVENTION_ONGOING },
      ],
    });

    const level4Open = await this.incidents.count({
      where: [
        { status: IncidentStatus.REPORTED, alertLevel: 4 },
        { status: IncidentStatus.INTERVENTION_ONGOING, alertLevel: 4 },
      ],
    });

    return {
      service: 'versys-api',
      version: this.version,
      nodeEnv: this.config.get<string>('nodeEnv'),
      eventMode: this.config.get<boolean>('eventMode') === true,
      eventName: this.config.get<string>('eventName') || null,
      maintenanceMode: this.config.get<boolean>('maintenanceMode') === true,
      dependencies: {
        redis: redisOk ? 'up' : 'down',
      },
      incidents: {
        open: openCount,
        level4Open,
      },
      serverTime: new Date().toISOString(),
      freezePolicy:
        'No new features. Hotfix only. Emergency paths always enabled unless MAINTENANCE_MODE.',
    };
  }

  private readPackageVersion(): string {
    try {
      const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
      return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
