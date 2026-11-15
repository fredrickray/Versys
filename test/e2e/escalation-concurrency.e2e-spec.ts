import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { ApiModule } from '../../src/api.module';
import type { AuthUser } from '../../src/common/decorators/current-user.decorator';
import {
  AlertLevel,
  AssignmentStatus,
  AuditAction,
  IncidentChannel,
  IncidentStatus,
  IncidentType,
  Permission,
  StaffCategory,
  UserCategory,
} from '../../src/common/enums';
import { AssignmentEntity } from '../../src/modules/assignments/entities/assignment.entity';
import { AssignmentsService } from '../../src/modules/assignments/assignments.service';
import { AuditLogEntity } from '../../src/modules/audit/entities/audit-log.entity';
import { EscalationDeadlineEntity } from '../../src/modules/escalation/entities/escalation-deadline.entity';
import { EscalationEventEntity } from '../../src/modules/escalation/entities/escalation-event.entity';
import { EscalationService } from '../../src/modules/escalation/escalation.service';
import { IncidentEntity } from '../../src/modules/incidents/entities/incident.entity';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { RedisService } from '../../src/redis/redis.service';
import { WorkerModule } from '../../src/worker.module';

describe('transactional escalation lifecycle', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let incidents: Repository<IncidentEntity>;
  let assignments: Repository<AssignmentEntity>;
  let deadlines: Repository<EscalationDeadlineEntity>;
  let escalationEvents: Repository<EscalationEventEntity>;
  let audits: Repository<AuditLogEntity>;
  let assignmentService: AssignmentsService;
  let escalation: EscalationService;
  let redis: RedisService;
  let userSequence = 0;

  const responder = (): AuthUser => ({
    userId: randomUUID(),
    staffCategory: StaffCategory.CAT_1,
    userCategory: UserCategory.SECURITY,
    isDispatcher: false,
    permissions: [
      Permission.ACCEPT_REJECT_INTERVENTION,
      Permission.CONFIRM_OR_ESCALATE_ASSIGNED,
    ],
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    incidents = dataSource.getRepository(IncidentEntity);
    assignments = dataSource.getRepository(AssignmentEntity);
    deadlines = dataSource.getRepository(EscalationDeadlineEntity);
    escalationEvents = dataSource.getRepository(EscalationEventEntity);
    audits = dataSource.getRepository(AuditLogEntity);
    assignmentService = app.get(AssignmentsService);
    escalation = app.get(EscalationService);
    redis = app.get(RedisService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('serializes assignment acceptance against automatic escalation', async () => {
    const first = responder();
    const second = responder();
    await persistUser(first);
    await persistUser(second);
    const incident = await persistIncident({
      alertLevel: AlertLevel.LOW,
      promptIssuedAt: new Date(Date.now() - 20 * 60_000),
    });
    await assignments.save(
      assignments.create({
        incidentId: incident.id,
        assigneeUserId: first.userId,
        assignedByUserId: null,
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(Date.now() - 30 * 60_000),
        generation: 0,
      }),
    );
    const pending = await assignments.save(
      assignments.create({
        incidentId: incident.id,
        assigneeUserId: second.userId,
        assignedByUserId: null,
        status: AssignmentStatus.PENDING,
        generation: 0,
      }),
    );
    await deadlines.save(
      deadlines.create({
        incidentId: incident.id,
        assignmentId: null,
        generation: 0,
        kind: 'auto',
        status: 'pending',
        dueAt: new Date(Date.now() - 1_000),
        completedAt: null,
      }),
    );

    const outcomes = await Promise.allSettled([
      assignmentService.accept(pending.id, second),
      escalation.autoEscalate(incident.id),
    ]);
    expect(outcomes.some((result) => result.status === 'fulfilled')).toBe(true);

    const current = await incidents.findOneByOrFail({ id: incident.id });
    expect(current.alertLevel).toBe(AlertLevel.MID);
    expect(current.escalationGeneration).toBe(1);
    expect(
      await assignments.count({
        where: { incidentId: incident.id, status: AssignmentStatus.ACCEPTED },
      }),
    ).toBe(0);
    expect(
      await escalationEvents.count({
        where: { incidentId: incident.id, action: 'auto_escalate' },
      }),
    ).toBe(1);
  });

  it('commits prompt history, audit, and the next durable deadline together', async () => {
    const actor = responder();
    await persistUser(actor);
    const incident = await persistIncident({ alertLevel: AlertLevel.LOW });
    const assignment = await assignments.save(
      assignments.create({
        incidentId: incident.id,
        assigneeUserId: actor.userId,
        assignedByUserId: null,
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(Date.now() - 10 * 60_000),
        generation: 0,
      }),
    );
    await deadlines.save(
      deadlines.create({
        incidentId: incident.id,
        assignmentId: assignment.id,
        generation: 0,
        kind: 'prompt',
        status: 'pending',
        dueAt: new Date(Date.now() - 1_000),
        completedAt: null,
      }),
    );

    await escalation.issuePrompt(incident.id, assignment.id);
    const current = await incidents.findOneByOrFail({ id: incident.id });
    expect(current.promptIssuedAt).toBeTruthy();
    expect(
      await escalationEvents.count({
        where: { incidentId: incident.id, action: 'prompt_due' },
      }),
    ).toBe(1);
    expect(
      await audits.count({
        where: {
          incidentId: incident.id,
          action: AuditAction.ESCALATION_PROMPTED,
        },
      }),
    ).toBe(1);
    expect(
      await deadlines.count({
        where: { incidentId: incident.id, generation: 0, kind: 'auto' },
      }),
    ).toBe(1);
  });

  it('records a due level-three freeze once and persists confirmation holds', async () => {
    const actor = responder();
    await persistUser(actor);
    const incident = await persistIncident({
      alertLevel: AlertLevel.HIGH,
      promptIssuedAt: new Date(Date.now() - 20 * 60_000),
    });
    await assignments.save(
      assignments.create({
        incidentId: incident.id,
        assigneeUserId: actor.userId,
        assignedByUserId: null,
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(Date.now() - 30 * 60_000),
        generation: 0,
      }),
    );
    await deadlines.save(
      deadlines.create({
        incidentId: incident.id,
        assignmentId: null,
        generation: 0,
        kind: 'auto',
        status: 'pending',
        dueAt: new Date(Date.now() - 1_000),
        completedAt: null,
      }),
    );

    await escalation.autoEscalate(incident.id);
    await escalation.autoEscalate(incident.id);
    expect(
      await escalationEvents.count({
        where: {
          incidentId: incident.id,
          action: 'auto_escalation_frozen',
        },
      }),
    ).toBe(1);

    await escalation.resolve(incident.id, actor, false);
    const current = await incidents.findOneByOrFail({ id: incident.id });
    expect(current.escalationHoldAt).toBeTruthy();
    expect(
      await deadlines.count({
        where: { incidentId: incident.id, status: 'pending' },
      }),
    ).toBe(0);
  });

  it('recovers a due database deadline after Redis and worker restart', async () => {
    const actor = responder();
    await persistUser(actor);
    const incident = await persistIncident({ alertLevel: AlertLevel.LOW });
    const assignment = await assignments.save(
      assignments.create({
        incidentId: incident.id,
        assigneeUserId: actor.userId,
        assignedByUserId: null,
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(Date.now() - 10 * 60_000),
        generation: 0,
      }),
    );
    await deadlines.save(
      deadlines.create({
        incidentId: incident.id,
        assignmentId: assignment.id,
        generation: 0,
        kind: 'prompt',
        status: 'pending',
        dueAt: new Date(Date.now() - 1_000),
        completedAt: null,
      }),
    );

    await redis.client.flushdb();
    const firstWorker = await NestFactory.createApplicationContext(
      WorkerModule,
      { logger: false, abortOnError: false },
    );
    try {
      await waitFor(async () => {
        return (
          (await escalationEvents.count({
            where: { incidentId: incident.id, action: 'prompt_due' },
          })) === 1
        );
      });
    } finally {
      await firstWorker.close();
    }

    await redis.client.flushdb();
    const secondWorker = await NestFactory.createApplicationContext(
      WorkerModule,
      { logger: false, abortOnError: false },
    );
    await secondWorker.close();
    expect(
      await escalationEvents.count({
        where: { incidentId: incident.id, action: 'prompt_due' },
      }),
    ).toBe(1);
  }, 30_000);

  async function persistUser(actor: AuthUser): Promise<void> {
    userSequence += 1;
    await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        id: actor.userId,
        phoneE164: `+234818${String(Date.now()).slice(-5)}${String(userSequence).padStart(2, '0')}`,
        fullName: 'Escalation Test Responder',
        staffRoleKey: 'sheriff_deputy',
        staffCategory: StaffCategory.CAT_1,
        userCategory: UserCategory.SECURITY,
        isDispatcher: false,
        isActive: true,
      }),
    );
  }

  function persistIncident(
    overrides: Partial<IncidentEntity>,
  ): Promise<IncidentEntity> {
    return incidents.save(
      incidents.create({
        publicCode: `ESC-${randomUUID().slice(0, 8)}`,
        type: IncidentType.FIGHT,
        status: IncidentStatus.INTERVENTION_ONGOING,
        alertLevel: AlertLevel.LOW,
        channel: IncidentChannel.APP_BUTTON,
        reporterUserId: null,
        reporterPhoneE164: null,
        locationLabel: 'escalation-test',
        placeId: null,
        latitude: null,
        longitude: null,
        promptIssuedAt: null,
        firstAcceptedAt: new Date(Date.now() - 30 * 60_000),
        resolvedAt: null,
        resolvedByUserId: null,
        escalationGeneration: 0,
        escalationHoldAt: null,
        isDrill: false,
        drillPurpose: null,
        drillActorUserId: null,
        metadata: {},
        ...overrides,
      }),
    );
  }
});

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('condition_timeout');
}
