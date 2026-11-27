import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async append(entry: {
    action: string;
    actorUserId?: string | null;
    incidentId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    correlationId?: string | null;
  }): Promise<AuditLogEntity | null> {
    try {
      const row = this.repo.create({
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        incidentId: entry.incidentId ?? null,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        metadata: entry.metadata ?? {},
        correlationId: entry.correlationId ?? null,
      });
      return await this.repo.save(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `audit append failed action=${entry.action}: ${msg}`,
      );
      return null;
    }
  }
}
