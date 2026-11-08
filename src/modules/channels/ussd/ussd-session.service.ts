import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import type { IncidentType } from '../../../common/enums';

export type UssdStep = 'type' | 'group' | 'place' | 'confirm';

export type UssdSession = {
  sessionId: string;
  phoneE164: string;
  step: UssdStep;
  type?: IncidentType;
  typeLabel?: string;
  groupKey?: string;
  placeId?: string;
  placeName?: string;
  placeCode?: string;
};

const TTL_SECONDS = 120;
const key = (sessionId: string) => `ussd:session:${sessionId}`;

@Injectable()
export class UssdSessionService {
  constructor(private readonly redis: RedisService) {}

  async start(phoneE164: string): Promise<UssdSession> {
    const session: UssdSession = {
      sessionId: randomUUID(),
      phoneE164,
      step: 'type',
    };
    await this.save(session);
    return session;
  }

  async get(sessionId: string): Promise<UssdSession | null> {
    const raw = await this.redis.client.get(key(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as UssdSession;
  }

  async save(session: UssdSession): Promise<void> {
    await this.redis.client.set(
      key(session.sessionId),
      JSON.stringify(session),
      'EX',
      TTL_SECONDS,
    );
  }

  async clear(sessionId: string): Promise<void> {
    await this.redis.client.del(key(sessionId));
  }
}
