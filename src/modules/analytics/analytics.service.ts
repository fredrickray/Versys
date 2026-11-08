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
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { LocationPingEntity } from '../location/entities/location-ping.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    @InjectRepository(LocationPingEntity)
    private readonly pings: Repository<LocationPingEntity>,
  ) {}

  private assertAnalytics(actor: AuthUser): void {
    if (!actor.permissions.includes(Permission.VIEW_ANALYTICS)) {
      throw new ForbiddenException('cannot_view_analytics');
    }
  }

  async summary(actor: AuthUser, opts: { from?: string; to?: string }) {
    this.assertAnalytics(actor);
    const from = opts.from
      ? new Date(opts.from)
      : new Date(Date.now() - 7 * 864e5);
    const to = opts.to ? new Date(opts.to) : new Date();

    const resolved = await this.incidents
      .createQueryBuilder('i')
      .where('i.status = :status', { status: IncidentStatus.RESOLVED })
      .andWhere('i.resolved_at BETWEEN :from AND :to', { from, to })
      .getMany();

    const responseTimesMs: number[] = [];
    for (const incident of resolved) {
      if (!incident.firstAcceptedAt || !incident.createdAt) continue;
      responseTimesMs.push(
        incident.firstAcceptedAt.getTime() - incident.createdAt.getTime(),
      );
    }

    const avgResponseMs =
      responseTimesMs.length === 0
        ? null
        : Math.round(
            responseTimesMs.reduce((a, b) => a + b, 0) / responseTimesMs.length,
          );

    const openCount = await this.incidents.count({
      where: [
        { status: IncidentStatus.REPORTED },
        { status: IncidentStatus.INTERVENTION_ONGOING },
      ],
    });

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      resolvedCount: resolved.length,
      openCount,
      avgResponseTimeMs: avgResponseMs,
      p50ResponseTimeMs: percentile(responseTimesMs, 0.5),
      p95ResponseTimeMs: percentile(responseTimesMs, 0.95),
    };
  }

  async incidentInsights(actor: AuthUser, incidentId: string) {
    this.assertAnalytics(actor);
    const incident = await this.incidents.findOne({
      where: { id: incidentId },
    });
    if (!incident) throw new NotFoundException('incident_not_found');

    const accepted = await this.assignments.find({
      where: { incidentId, status: AssignmentStatus.ACCEPTED },
      order: { acceptedAt: 'ASC' },
    });

    const firstAccept = accepted[0]?.acceptedAt ?? incident.firstAcceptedAt;
    const responseTimeMs =
      firstAccept && incident.createdAt
        ? firstAccept.getTime() - incident.createdAt.getTime()
        : null;

    const trail = await this.pings.find({
      where: { incidentId },
      order: { recordedAt: 'ASC' },
      take: 1000,
    });

    const routesByUser = new Map<
      string,
      { latitude: number; longitude: number; recordedAt: string }[]
    >();
    for (const ping of trail) {
      const list = routesByUser.get(ping.userId) ?? [];
      list.push({
        latitude: ping.latitude,
        longitude: ping.longitude,
        recordedAt: ping.recordedAt.toISOString(),
      });
      routesByUser.set(ping.userId, list);
    }

    return {
      incidentId: incident.id,
      publicCode: incident.publicCode,
      type: incident.type,
      alertLevel: incident.alertLevel,
      status: incident.status,
      createdAt: incident.createdAt,
      firstAcceptedAt: firstAccept,
      resolvedAt: incident.resolvedAt,
      responseTimeMs,
      timeToResolveMs:
        incident.resolvedAt && incident.createdAt
          ? incident.resolvedAt.getTime() - incident.createdAt.getTime()
          : null,
      routes: [...routesByUser.entries()].map(([userId, points]) => ({
        userId,
        pointCount: points.length,
        distanceMetresApprox: pathLengthMetres(points),
        points,
      })),
    };
  }
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? null;
}

function pathLengthMetres(
  points: { latitude: number; longitude: number }[],
): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1], points[i]);
  }
  return Math.round(total);
}

function haversine(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
