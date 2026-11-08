import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
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
  }): Promise<AuditLogEntity> {
    const row = this.repo.create({
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      incidentId: entry.incidentId ?? null,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
      correlationId: entry.correlationId ?? null,
    });
    return this.repo.save(row);
  }
}
