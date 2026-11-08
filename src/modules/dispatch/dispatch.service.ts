import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  AssignmentStatus,
  IncidentStatus,
  Permission,
} from '../../common/enums';
import { AssignmentsService } from '../assignments/assignments.service';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class DispatchService {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly users: UsersService,
  ) {}

  private assertDispatcher(actor: AuthUser): void {
    if (
      !actor.isDispatcher &&
      !actor.permissions.includes(Permission.DISPATCH_ASSIGN)
    ) {
      throw new ForbiddenException('dispatcher_only');
    }
  }

  async board(
    actor: AuthUser,
    opts: { status?: IncidentStatus; alertLevel?: number; limit?: number },
  ) {
    this.assertDispatcher(actor);
    const qb = this.incidents
      .createQueryBuilder('i')
      .orderBy('i.created_at', 'DESC')
      .take(opts.limit ?? 50);

    if (opts.status) {
      qb.andWhere('i.status = :status', { status: opts.status });
    } else {
      qb.andWhere('i.status != :resolved', {
        resolved: IncidentStatus.RESOLVED,
      });
    }
    if (opts.alertLevel != null) {
      qb.andWhere('i.alert_level = :level', { level: opts.alertLevel });
    }

    const rows = await qb.getMany();
    const enriched = [];
    for (const incident of rows) {
      const active = await this.assignments.find({
        where: {
          incidentId: incident.id,
          status: AssignmentStatus.ACCEPTED,
        },
      });
      const pending = await this.assignments.count({
        where: {
          incidentId: incident.id,
          status: AssignmentStatus.PENDING,
        },
      });
      enriched.push({
        ...incident,
        acceptedCount: active.length,
        pendingCount: pending,
        acceptedUserIds: active.map((a) => a.assigneeUserId),
      });
    }
    return enriched;
  }

  async detail(actor: AuthUser, incidentId: string) {
    this.assertDispatcher(actor);
    const incident = await this.incidents.findOne({
      where: { id: incidentId },
    });
    if (!incident) throw new NotFoundException('incident_not_found');
    const assignments = await this.assignments.find({
      where: { incidentId },
      order: { createdAt: 'DESC' },
    });
    return { incident, assignments };
  }

  assign(actor: AuthUser, incidentId: string, assigneeUserId: string) {
    this.assertDispatcher(actor);
    return this.assignmentsService.createOrSelfAssign(
      incidentId,
      actor,
      assigneeUserId,
    );
  }

  async staffRoster(actor: AuthUser) {
    this.assertDispatcher(actor);
    const staff = await this.users.listAssignableStaff();
    return staff.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      phoneE164: u.phoneE164,
      staffCategory: u.staffCategory,
      staffRoleKey: u.staffRoleKey,
      lastSeenAt: u.lastSeenAt,
    }));
  }
}
