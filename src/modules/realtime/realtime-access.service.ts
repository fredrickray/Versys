import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AssignmentStatus, Permission } from '../../common/enums';
import { PrincipalService } from '../auth/principal.service';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';

@Injectable()
export class RealtimeAccessService {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly principals: PrincipalService,
  ) {}

  resolvePrincipal(userId: string): Promise<AuthUser> {
    return this.principals.resolve(userId);
  }

  hasDispatchAccess(principal: AuthUser): boolean {
    return (
      principal.isDispatcher ||
      principal.permissions.includes(Permission.DISPATCH_ASSIGN)
    );
  }

  async canViewIncident(
    principal: AuthUser,
    incidentId: string,
  ): Promise<boolean> {
    if (this.hasDispatchAccess(principal)) {
      return this.incidents.exist({ where: { id: incidentId } });
    }

    const incident = await this.incidents.findOne({
      where: { id: incidentId },
      select: { id: true, reporterUserId: true },
    });
    if (!incident) return false;
    if (incident.reporterUserId === principal.userId) return true;

    const canRespond =
      principal.permissions.includes(Permission.ACCEPT_REJECT_INTERVENTION) ||
      principal.permissions.includes(Permission.CONFIRM_OR_ESCALATE_ASSIGNED);
    if (!canRespond) return false;

    return this.assignments.exist({
      where: {
        incidentId,
        assigneeUserId: principal.userId,
        status: AssignmentStatus.ACCEPTED,
      },
    });
  }
}
