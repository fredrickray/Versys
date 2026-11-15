import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AlertLevel } from '../../../common/enums';
import { IncidentEntity } from '../../incidents/entities/incident.entity';
import { IncidentsService } from '../../incidents/incidents.service';
import { NotificationIntentEntity } from '../entities/notification-intent.entity';
import { NotificationsService } from '../notifications.service';

const LEASE_MS = 30_000;

@Injectable()
export class NotificationIntentProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationIntentProcessor.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectRepository(NotificationIntentEntity)
    private readonly intents: Repository<NotificationIntentEntity>,
    private readonly dataSource: DataSource,
    private readonly incidents: IncidentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.run();
    this.timer = setInterval(() => {
      void this.run();
    }, 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.intents
        .createQueryBuilder('intent')
        .where('intent.status = :pending', { pending: 'pending' })
        .orWhere(
          '(intent.status = :processing AND intent.lease_expires_at <= :now)',
          { processing: 'processing', now: new Date() },
        )
        .orderBy('intent.created_at', 'ASC')
        .take(25)
        .getMany();
      for (const candidate of candidates) await this.process(candidate.id);
    } finally {
      this.running = false;
    }
  }

  private async process(intentId: string): Promise<void> {
    const owner = randomUUID();
    const intent = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(NotificationIntentEntity);
      const row = await repo
        .createQueryBuilder('intent')
        .setLock('pessimistic_write')
        .where('intent.id = :intentId', { intentId })
        .getOne();
      if (!row || row.status === 'completed') return null;
      if (
        row.status === 'processing' &&
        row.leaseExpiresAt &&
        row.leaseExpiresAt.getTime() > Date.now()
      ) {
        return null;
      }
      row.status = 'processing';
      row.leaseOwner = owner;
      row.leaseExpiresAt = new Date(Date.now() + LEASE_MS);
      row.attemptCount += 1;
      row.lastError = null;
      return repo.save(row);
    });
    if (!intent) return;

    try {
      const incident = await this.dataSource
        .getRepository(IncidentEntity)
        .findOne({ where: { id: intent.incidentId } });
      if (!incident || incident.isDrill) {
        await this.complete(intent.id, owner);
        return;
      }

      const userIds =
        intent.userIds.length > 0
          ? intent.userIds
          : intent.kind === 'incident_initial'
            ? await this.incidents.resolveNotifyTargets(incident)
            : await this.incidents.resolveLevelNotifyTargets(incident);
      if (userIds.length) {
        await this.notifications.onIncidentNotify({
          eventKey: intent.eventKey,
          incidentId: incident.id,
          userIds,
          alertLevel: incident.alertLevel,
          publicCode: incident.publicCode,
          type:
            intent.kind === 'prompt'
              ? 'prompt_resolve_or_escalate'
              : incident.type,
          alarm: incident.alertLevel >= AlertLevel.HIGH,
        });
      }
      await this.complete(intent.id, owner);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.release(intent.id, owner, message);
      this.logger.warn(`Notification intent ${intent.id} deferred: ${message}`);
    }
  }

  private async complete(intentId: string, owner: string): Promise<void> {
    await this.intents.update(
      { id: intentId, leaseOwner: owner },
      {
        status: 'completed',
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
      },
    );
  }

  private async release(
    intentId: string,
    owner: string,
    message: string,
  ): Promise<void> {
    await this.intents.update(
      { id: intentId, leaseOwner: owner },
      {
        status: 'pending',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: message.slice(0, 512),
      },
    );
  }
}
