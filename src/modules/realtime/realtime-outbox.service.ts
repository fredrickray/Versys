import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  RealtimeOutboxEntity,
  type RealtimeEventType,
} from './entities/realtime-outbox.entity';

@Injectable()
export class RealtimeOutboxService {
  async append(
    manager: EntityManager,
    event: {
      eventKey: string;
      type: RealtimeEventType;
      incidentId?: string | null;
      payload?: Record<string, unknown>;
      occurredAt?: Date;
    },
  ): Promise<void> {
    const occurredAt = event.occurredAt ?? new Date();
    await manager
      .getRepository(RealtimeOutboxEntity)
      .createQueryBuilder()
      .insert()
      .values({
        eventKey: event.eventKey,
        type: event.type,
        incidentId: event.incidentId ?? null,
        payload: event.payload ?? {},
        occurredAt,
        availableAt: occurredAt,
        attemptCount: 0,
        lastError: null,
        publishedAt: null,
      })
      .orIgnore()
      .execute();
  }
}
