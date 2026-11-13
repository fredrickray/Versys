import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async append(
    entry: {
      action: string;
      actorUserId?: string | null;
      incidentId?: string | null;
      resourceType?: string | null;
      resourceId?: string | null;
      metadata?: Record<string, unknown>;
      correlationId?: string | null;
    },
    manager?: EntityManager,
  ): Promise<AuditLogEntity> {
    const repo = manager?.getRepository(AuditLogEntity) ?? this.repo;
    const row = repo.create({
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      incidentId: entry.incidentId ?? null,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
      correlationId: entry.correlationId ?? null,
    });
    return repo.save(row);
  }
}
