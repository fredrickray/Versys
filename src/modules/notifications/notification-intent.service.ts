import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { NotificationIntentKind } from './entities/notification-intent.entity';

@Injectable()
export class NotificationIntentService {
  async append(
    manager: EntityManager,
    input: {
      eventKey: string;
      incidentId: string;
      kind: NotificationIntentKind;
      userIds?: string[];
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO notification_intents (
          event_key,
          incident_id,
          kind,
          user_ids,
          payload,
          status,
          attempt_count
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'pending', 0)
        ON CONFLICT (event_key) DO NOTHING
      `,
      [
        input.eventKey,
        input.incidentId,
        input.kind,
        JSON.stringify(input.userIds ?? []),
        JSON.stringify(input.payload ?? {}),
      ],
    );
  }
}
