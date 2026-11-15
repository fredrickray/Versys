import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  AssignmentStatus,
  AuditAction,
  IncidentStatus,
  Permission,
} from '../../common/enums';
import { STAFF_GEO_KEY } from '../../common/constants/location';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { StaffShiftEntity } from './entities/staff-shift.entity';

export const LOCATION_EXPIRY_KEY = 'geo:staff:expiry';
export const locationMetaKey = (userId: string) => `loc:meta:${userId}`;

@Injectable()
export class StaffShiftService {
  private readonly shiftDurationMs: number;

  constructor(
    @InjectRepository(StaffShiftEntity)
    private readonly shifts: Repository<StaffShiftEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.shiftDurationMs = config.getOrThrow<number>(
      'location.shiftDurationMs',
    );
  }

  async start(actor: AuthUser): Promise<StaffShiftEntity> {
    this.assertStaff(actor);
    return this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const repo = manager.getRepository(StaffShiftEntity);
      const active = await repo
        .createQueryBuilder('shift')
        .setLock('pessimistic_write')
        .where('shift.user_id = :userId', { userId: actor.userId })
        .andWhere('shift.status = :status', { status: 'active' })
        .getOne();
      if (active && active.expiresAt.getTime() > now.getTime()) {
        throw new BadRequestException('shift_already_active');
      }
      if (active) {
        active.status = 'expired';
        active.endedAt = now;
        await repo.save(active);
      }
      const shift = await repo.save(
        repo.create({
          userId: actor.userId,
          status: 'active',
          startedAt: now,
          expiresAt: new Date(now.getTime() + this.shiftDurationMs),
          endedAt: null,
        }),
      );
      await this.audit.append(
        {
          action: AuditAction.SHIFT_STARTED,
          actorUserId: actor.userId,
          resourceType: 'staff_shift',
          resourceId: shift.id,
          metadata: { expiresAt: shift.expiresAt.toISOString() },
        },
        manager,
      );
      return shift;
    });
  }

  async current(actor: AuthUser): Promise<StaffShiftEntity | null> {
    this.assertStaff(actor);
    const shift = await this.shifts.findOne({
      where: { userId: actor.userId, status: 'active' },
    });
    if (!shift) return null;
    if (shift.expiresAt.getTime() > Date.now()) return shift;
    await this.expireShift(shift);
    return null;
  }

  async end(actor: AuthUser): Promise<void> {
    this.assertStaff(actor);
    await this.dataSource.transaction(async (manager) => {
      const shift = await manager
        .getRepository(StaffShiftEntity)
        .createQueryBuilder('shift')
        .setLock('pessimistic_write')
        .where('shift.user_id = :userId', { userId: actor.userId })
        .andWhere('shift.status = :status', { status: 'active' })
        .getOne();
      if (!shift) return;
      shift.status = 'ended';
      shift.endedAt = new Date();
      await manager.getRepository(StaffShiftEntity).save(shift);
      await this.audit.append(
        {
          action: AuditAction.SHIFT_ENDED,
          actorUserId: actor.userId,
          resourceType: 'staff_shift',
          resourceId: shift.id,
        },
        manager,
      );
    });
    await this.cleanupUser(actor.userId);
  }

  async expireDue(): Promise<number> {
    const due = await this.shifts
      .createQueryBuilder('shift')
      .where('shift.status = :status', { status: 'active' })
      .andWhere('shift.expires_at <= :now', { now: new Date() })
      .getMany();
    for (const shift of due) await this.expireShift(shift);
    return due.length;
  }

  async removeExpiredLiveLocations(): Promise<number> {
    const userIds = await this.redis.client.zrangebyscore(
      LOCATION_EXPIRY_KEY,
      '-inf',
      Date.now(),
    );
    for (const userId of userIds) {
      await this.redis.client
        .multi()
        .zrem(STAFF_GEO_KEY, userId)
        .zrem(LOCATION_EXPIRY_KEY, userId)
        .del(locationMetaKey(userId))
        .exec();
    }
    return userIds.length;
  }

  private async expireShift(shift: StaffShiftEntity): Promise<void> {
    shift.status = 'expired';
    shift.endedAt = new Date();
    await this.shifts.save(shift);
    await this.audit.append({
      action: AuditAction.SHIFT_EXPIRED,
      actorUserId: shift.userId,
      resourceType: 'staff_shift',
      resourceId: shift.id,
    });
    await this.cleanupUser(shift.userId);
  }

  async cleanupUser(userId: string): Promise<void> {
    const accepted = await this.assignments
      .createQueryBuilder('assignment')
      .innerJoin(
        IncidentEntity,
        'incident',
        'incident.id = assignment.incident_id',
      )
      .where('assignment.assignee_user_id = :userId', { userId })
      .andWhere('assignment.status = :assignmentStatus', {
        assignmentStatus: AssignmentStatus.ACCEPTED,
      })
      .andWhere('incident.status != :incidentStatus', {
        incidentStatus: IncidentStatus.RESOLVED,
      })
      .getExists();
    if (accepted) return;
    await this.redis.client
      .multi()
      .zrem(STAFF_GEO_KEY, userId)
      .zrem(LOCATION_EXPIRY_KEY, userId)
      .del(locationMetaKey(userId))
      .exec();
  }

  private assertStaff(actor: AuthUser): void {
    if (
      !actor.permissions.includes(Permission.ACCEPT_REJECT_INTERVENTION) &&
      !actor.isDispatcher
    ) {
      throw new ForbiddenException('staff_shift_required');
    }
  }
}
