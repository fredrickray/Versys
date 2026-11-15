import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { RealtimeEventType } from './entities/realtime-outbox.entity';

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
    await manager.query(
      `
        INSERT INTO realtime_outbox (
          event_key,
          type,
          incident_id,
          payload,
          occurred_at,
          available_at,
          attempt_count
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $5, 0)
        ON CONFLICT (event_key) DO NOTHING
      `,
      [
        event.eventKey,
        event.type,
        event.incidentId ?? null,
        JSON.stringify(event.payload ?? {}),
        occurredAt,
      ],
    );
  }
}
