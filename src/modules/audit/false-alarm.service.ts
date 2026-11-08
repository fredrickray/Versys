import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditAction, Permission } from '../../common/enums';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

/**
 * Surfaces reporters who trip rate limits / create many short-lived alerts
 * for dispatcher/CAT3 false-alarm review (spec security section).
 */
@Injectable()
export class FalseAlarmService {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly audits: Repository<AuditLogEntity>,
    private readonly audit: AuditService,
  ) {}

  private assertReviewer(actor: AuthUser): void {
    if (
      !actor.permissions.includes(Permission.VIEW_ANALYTICS) &&
      !actor.isDispatcher
    ) {
      throw new ForbiddenException('cannot_review_false_alarms');
    }
  }

  async candidates(actor: AuthUser, hours = 24) {
    this.assertReviewer(actor);
    const since = new Date(Date.now() - hours * 3600 * 1000);

    const rows = await this.incidents
      .createQueryBuilder('i')
      .select('i.reporter_phone_e164', 'phone')
      .addSelect('i.reporter_user_id', 'userId')
      .addSelect('COUNT(*)', 'alertCount')
      .where('i.created_at >= :since', { since })
      .andWhere(
        '(i.reporter_phone_e164 IS NOT NULL OR i.reporter_user_id IS NOT NULL)',
      )
      .groupBy('i.reporter_phone_e164')
      .addGroupBy('i.reporter_user_id')
      .having('COUNT(*) >= :min', { min: 3 })
      .orderBy('"alertCount"', 'DESC')
      .getRawMany<{
        phone: string | null;
        userId: string | null;
        alertCount: string;
      }>();

    const rateLimited = await this.audits
      .createQueryBuilder('a')
      .where('a.action = :action', { action: AuditAction.AUTH_FAILED })
      .andWhere('a.created_at >= :since', { since })
      .getCount();

    return {
      windowHours: hours,
      highVolumeReporters: rows.map((r) => ({
        phoneE164: r.phone,
        userId: r.userId,
        alertCount: Number(r.alertCount),
      })),
      recentAuthFailures: rateLimited,
    };
  }

  async flag(actor: AuthUser, opts: { incidentId: string; note?: string }) {
    this.assertReviewer(actor);
    await this.audit.append({
      action: 'incident.false_alarm_flagged',
      actorUserId: actor.userId,
      incidentId: opts.incidentId,
      metadata: { note: opts.note ?? null },
    });
    return { ok: true };
  }
}
