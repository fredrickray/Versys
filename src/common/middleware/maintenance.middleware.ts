import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { shouldBlockForMaintenance } from './maintenance.policy';

/**
 * Planned failover only. Never enable during a live emergency event —
 * emergency channels must stay up. Health/ready always pass through.
 */
@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const maintenance = this.config.get<boolean>('maintenanceMode') === true;
    const path = req.path || '';
    if (!shouldBlockForMaintenance(maintenance, path)) {
      next();
      return;
    }

    res.status(503).json({
      statusCode: 503,
      error: 'maintenance_mode',
      message:
        this.config.get<string>('maintenanceMessage') ??
        'VERSYS under maintenance — use radio / dispatcher hotline',
      retryAfterSeconds: 60,
    });
  }
}
