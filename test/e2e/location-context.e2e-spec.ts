import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { ApiModule } from '../../src/api.module';
import type { AuthUser } from '../../src/common/decorators/current-user.decorator';
import {
  AlertLevel,
  AssignmentStatus,
  IncidentChannel,
  IncidentStatus,
  IncidentType,
  Permission,
  StaffCategory,
  UserCategory,
} from '../../src/common/enums';
import { AssignmentEntity } from '../../src/modules/assignments/entities/assignment.entity';
import { IncidentEntity } from '../../src/modules/incidents/entities/incident.entity';
import { IncidentsService } from '../../src/modules/incidents/incidents.service';
import { LocationService } from '../../src/modules/location/location.service';
import {
  LOCATION_EXPIRY_KEY,
  StaffShiftService,
  locationMetaKey,
} from '../../src/modules/location/staff-shift.service';
import { UserEntity } from '../../src/modules/users/entities/user.entity';
import { RedisService } from '../../src/redis/redis.service';
import { STAFF_GEO_KEY } from '../../src/common/constants/location';

describe('server-owned location context', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redis: RedisService;
  let shifts: StaffShiftService;
  let location: LocationService;
  let incidentService: IncidentsService;
  let users: Repository<UserEntity>;
  let incidents: Repository<IncidentEntity>;
  let assignments: Repository<AssignmentEntity>;
  let staff: UserEntity;
  let actor: AuthUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    redis = app.get(RedisService);
    shifts = app.get(StaffShiftService);
    location = app.get(LocationService);
    incidentService = app.get(IncidentsService);
    users = dataSource.getRepository(UserEntity);
    incidents = dataSource.getRepository(IncidentEntity);
    assignments = dataSource.getRepository(AssignmentEntity);

    staff = await users.save(
      users.create({
        phoneE164: `+234820${String(Date.now()).slice(-7)}`,
        fullName: 'Location Test Staff',
        staffRoleKey: 'sheriff_deputy',
        staffCategory: StaffCategory.CAT_1,
        userCategory: UserCategory.SECURITY,
        isDispatcher: false,
        isActive: true,
      }),
    );
    actor = {
      userId: staff.id,
      staffCategory: StaffCategory.CAT_1,
      userCategory: UserCategory.SECURITY,
      isDispatcher: false,
      permissions: [
        Permission.ACCEPT_REJECT_INTERVENTION,
        Permission.CONFIRM_OR_ESCALATE_ASSIGNED,
      ],
    };
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('rejects untrusted duty state and invalid measurements', async () => {
    await expect(location.ingest(staff.id, ping(new Date()))).rejects.toThrow(
      'location_requires_incident_or_shift',
    );

    await shifts.start(actor);
    await expect(
      location.ingest(staff.id, ping(new Date(Date.now() - 121_000))),
    ).rejects.toThrow('location_stale');
    await expect(
      location.ingest(staff.id, ping(new Date(Date.now() + 31_000))),
    ).rejects.toThrow('location_from_future');
    await expect(
      location.ingest(staff.id, {
        ...ping(new Date()),
        accuracyMetres: 101,
      }),
    ).rejects.toThrow('location_inaccurate');
    await expect(location.ingest(staff.id, ping(new Date()))).resolves.toEqual({
      accepted: true,
    });
  });

  it('accepts only live shift or accepted-assignment context', async () => {
    await shifts.end(actor);
    await expect(location.ingest(staff.id, ping(new Date()))).rejects.toThrow(
      'location_requires_incident_or_shift',
    );

    const incident = await createIncident();
    const assignment = await assignments.save(
      assignments.create({
        incidentId: incident.id,
        assigneeUserId: staff.id,
        assignedByUserId: null,
        status: AssignmentStatus.ACCEPTED,
        acceptedAt: new Date(),
        generation: incident.escalationGeneration,
      }),
    );
    await expect(
      location.ingest(staff.id, {
        ...ping(new Date()),
        incidentId: incident.id,
      }),
    ).resolves.toEqual({ accepted: true });

    assignment.status = AssignmentStatus.WITHDRAWN;
    assignment.withdrawnAt = new Date();
    await assignments.save(assignment);
    await expect(
      location.ingest(staff.id, {
        ...ping(new Date(Date.now() + 1)),
        incidentId: incident.id,
      }),
    ).rejects.toThrow('not_active_responder');
  });

  it('uses fresh PostGIS-backed duty locations for routing and expires Redis cache', async () => {
    await shifts.start(actor);
    await location.ingest(staff.id, ping(new Date(Date.now() + 2)));
    const incident = await createIncident({
      latitude: 9.0765,
      longitude: 7.3986,
    });
    expect(await incidentService.resolveNotifyTargets(incident)).toContain(
      staff.id,
    );

    await redis.client.zadd(LOCATION_EXPIRY_KEY, Date.now() - 1, staff.id);
    await shifts.removeExpiredLiveLocations();
    expect(await redis.client.geopos(STAFF_GEO_KEY, staff.id)).toEqual([null]);
    expect(await redis.client.get(locationMetaKey(staff.id))).toBeNull();
  });

  function ping(recordedAt: Date) {
    return {
      latitude: 9.0765,
      longitude: 7.3986,
      accuracyMetres: 10,
      recordedAt: recordedAt.toISOString(),
    };
  }

  function createIncident(
    coordinates: { latitude?: number; longitude?: number } = {},
  ): Promise<IncidentEntity> {
    return incidents.save(
      incidents.create({
        publicCode: `LOC-${randomUUID().slice(0, 8)}`,
        type: IncidentType.FIGHT,
        status: IncidentStatus.INTERVENTION_ONGOING,
        alertLevel: AlertLevel.LOW,
        channel: IncidentChannel.APP_BUTTON,
        reporterUserId: null,
        reporterPhoneE164: null,
        locationLabel: 'location-test',
        placeId: null,
        latitude: coordinates.latitude ?? null,
        longitude: coordinates.longitude ?? null,
        promptIssuedAt: null,
        firstAcceptedAt: null,
        resolvedAt: null,
        resolvedByUserId: null,
        escalationGeneration: 0,
        escalationHoldAt: null,
        isDrill: false,
        drillPurpose: null,
        drillActorUserId: null,
        metadata: {},
      }),
    );
  }
});
