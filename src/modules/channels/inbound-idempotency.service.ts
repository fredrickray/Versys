import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InboundRequestEntity } from './entities/inbound-request.entity';

const LEASE_MS = 30_000;

export type InboundExecution<
  TValue,
  TResponse extends Record<string, unknown>,
> =
  | {
      kind: 'completed';
      httpStatus: number;
      body: TResponse;
      newlyCompleted: boolean;
      value?: TValue;
    }
  | { kind: 'in_progress'; retryAfterSeconds: number }
  | { kind: 'conflict' };

export type IdempotencyReservation<TResponse extends Record<string, unknown>> =
  | { kind: 'reserved'; id: string; newlyReserved: boolean }
  | { kind: 'conflict' }
  | Extract<InboundExecution<never, TResponse>, { kind: 'completed' }>;

type Claimed = { kind: 'claimed'; id: string; ownerToken: string };
type ClaimResult<TResponse extends Record<string, unknown>> =
  Claimed | InboundExecution<never, TResponse>;

type Completion<TValue, TResponse extends Record<string, unknown>> = {
  httpStatus: number;
  body: TResponse;
  incidentId?: string | null;
  value: TValue;
};

export class InboundRequestInProgressException extends ServiceUnavailableException {
  constructor(readonly retryAfterSeconds: number) {
    super('inbound_request_in_progress');
  }
}

export class InboundRequestConflictException extends ConflictException {
  constructor() {
    super('inbound_request_payload_conflict');
  }
}

@Injectable()
export class InboundIdempotencyService {
  constructor(
    @InjectRepository(InboundRequestEntity)
    private readonly requests: Repository<InboundRequestEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async execute<
    TRequest extends Record<string, unknown>,
    TValue,
    TResponse extends Record<string, unknown>,
  >(
    source: string,
    providerKey: string,
    request: TRequest,
    complete: (
      manager: EntityManager,
      storedRequest: TRequest,
    ) => Promise<Completion<TValue, TResponse>>,
    beforeComplete?: () => Promise<void>,
  ): Promise<InboundExecution<TValue, TResponse>> {
    const claim = await this.claim<TRequest, TResponse>(
      source,
      providerKey,
      request,
    );
    if (claim.kind !== 'claimed') return claim;

    try {
      await beforeComplete?.();
    } catch (error) {
      await this.release(claim);
      throw error;
    }

    try {
      return await this.complete(claim, complete);
    } catch (error) {
      await this.recordFailure(claim, error);
      throw error;
    }
  }

  async reserve<
    TRequest extends Record<string, unknown>,
    TResponse extends Record<string, unknown>,
  >(
    source: string,
    providerKey: string,
    request: TRequest,
  ): Promise<IdempotencyReservation<TResponse>> {
    const requestHash = hash(stableJson(request));
    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager.query<{ id: string }[]>(
        `
          INSERT INTO inbound_requests (
            source,
            provider_key,
            request_hash,
            request_payload,
            status,
            lease_owner,
            lease_expires_at,
            attempt_count
          )
          VALUES ($1, $2, $3, $4::jsonb, 'processing', NULL, NULL, 0)
          ON CONFLICT (source, provider_key) DO NOTHING
          RETURNING id
        `,
        [source, providerKey, requestHash, JSON.stringify(request)],
      );
      if (inserted[0]) {
        return { kind: 'reserved', id: inserted[0].id, newlyReserved: true };
      }

      const existing = await manager
        .getRepository(InboundRequestEntity)
        .findOne({
          where: { source, providerKey },
        });
      if (!existing) throw new Error('idempotency_reservation_lost');
      if (existing.requestHash !== requestHash) return { kind: 'conflict' };
      if (existing.status === 'completed') {
        return this.completedResult<TResponse>(existing, false);
      }
      return { kind: 'reserved', id: existing.id, newlyReserved: false };
    });
  }

  async findStoredRequest<TRequest extends Record<string, unknown>>(
    source: string,
    providerKey: string,
  ): Promise<TRequest | null> {
    const request = await this.requests.findOne({
      where: { source, providerKey },
    });
    return request ? (request.requestPayload as TRequest) : null;
  }

  ensureCompleted<TValue, TResponse extends Record<string, unknown>>(
    result: InboundExecution<TValue, TResponse>,
  ): Extract<InboundExecution<TValue, TResponse>, { kind: 'completed' }> {
    if (result.kind === 'conflict') {
      throw new InboundRequestConflictException();
    }
    if (result.kind === 'in_progress') {
      throw new InboundRequestInProgressException(result.retryAfterSeconds);
    }
    return result;
  }

  private async claim<
    TRequest extends Record<string, unknown>,
    TResponse extends Record<string, unknown>,
  >(
    source: string,
    providerKey: string,
    request: TRequest,
  ): Promise<ClaimResult<TResponse>> {
    const requestHash = hash(stableJson(request));
    const ownerToken = randomUUID();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);

    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager.query<{ id: string }[]>(
        `
          INSERT INTO inbound_requests (
            source,
            provider_key,
            request_hash,
            request_payload,
            status,
            lease_owner,
            lease_expires_at,
            attempt_count
          )
          VALUES ($1, $2, $3, $4::jsonb, 'processing', $5, $6, 1)
          ON CONFLICT (source, provider_key) DO NOTHING
          RETURNING id
        `,
        [
          source,
          providerKey,
          requestHash,
          JSON.stringify(request),
          ownerToken,
          leaseExpiresAt,
        ],
      );

      if (inserted[0]) {
        return { kind: 'claimed', id: inserted[0].id, ownerToken };
      }

      const existing = await manager
        .getRepository(InboundRequestEntity)
        .findOne({
          where: { source, providerKey },
        });
      if (!existing) {
        throw new Error('inbound_request_claim_lost');
      }
      if (existing.requestHash !== requestHash) return { kind: 'conflict' };
      if (existing.status === 'completed') {
        return this.completedResult<TResponse>(existing, false);
      }
      if (
        existing.leaseExpiresAt &&
        existing.leaseExpiresAt.getTime() > now.getTime()
      ) {
        return {
          kind: 'in_progress',
          retryAfterSeconds: retryAfterSeconds(existing.leaseExpiresAt, now),
        };
      }

      const reclaimed = await manager
        .getRepository(InboundRequestEntity)
        .createQueryBuilder()
        .update(InboundRequestEntity)
        .set({
          leaseOwner: ownerToken,
          leaseExpiresAt,
          attemptCount: () => 'attempt_count + 1',
          lastError: null,
        })
        .where('id = :id', { id: existing.id })
        .andWhere('status = :status', { status: 'processing' })
        .andWhere('request_hash = :requestHash', { requestHash })
        .andWhere('(lease_expires_at IS NULL OR lease_expires_at <= :now)', {
          now,
        })
        .execute();
      if (reclaimed.affected === 1) {
        return { kind: 'claimed', id: existing.id, ownerToken };
      }

      const current = await manager
        .getRepository(InboundRequestEntity)
        .findOne({
          where: { id: existing.id },
        });
      if (!current) throw new Error('inbound_request_claim_lost');
      if (current.requestHash !== requestHash) return { kind: 'conflict' };
      if (current.status === 'completed') {
        return this.completedResult<TResponse>(current, false);
      }
      return {
        kind: 'in_progress',
        retryAfterSeconds: retryAfterSeconds(current.leaseExpiresAt, now),
      };
    });
  }

  private async complete<
    TValue,
    TRequest extends Record<string, unknown>,
    TResponse extends Record<string, unknown>,
  >(
    claim: Claimed,
    handler: (
      manager: EntityManager,
      storedRequest: TRequest,
    ) => Promise<Completion<TValue, TResponse>>,
  ): Promise<InboundExecution<TValue, TResponse>> {
    return this.dataSource.transaction(async (manager) => {
      const request = await manager
        .getRepository(InboundRequestEntity)
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id: claim.id })
        .getOne();

      if (!request) throw new Error('inbound_request_missing');
      if (request.status === 'completed') {
        return this.completedResult<TResponse>(request, false);
      }
      if (request.leaseOwner !== claim.ownerToken) {
        const now = new Date();
        return {
          kind: 'in_progress',
          retryAfterSeconds: retryAfterSeconds(request.leaseExpiresAt, now),
        };
      }

      const completion = await handler(
        manager,
        request.requestPayload as TRequest,
      );
      request.status = 'completed';
      request.incidentId = completion.incidentId ?? null;
      request.responseStatus = completion.httpStatus;
      request.responseBody = completion.body;
      request.completedAt = new Date();
      request.leaseOwner = null;
      request.leaseExpiresAt = null;
      request.lastError = null;
      await manager.getRepository(InboundRequestEntity).save(request);

      return {
        kind: 'completed',
        httpStatus: completion.httpStatus,
        body: completion.body,
        newlyCompleted: true,
        value: completion.value,
      };
    });
  }

  private async release(claim: Claimed): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const request = await manager
        .getRepository(InboundRequestEntity)
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id: claim.id })
        .getOne();
      if (
        request?.status === 'processing' &&
        request.leaseOwner === claim.ownerToken
      ) {
        request.leaseExpiresAt = new Date();
        request.leaseOwner = null;
        await manager.getRepository(InboundRequestEntity).save(request);
      }
    });
  }

  private async recordFailure(claim: Claimed, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.dataSource.transaction(async (manager) => {
      const request = await manager
        .getRepository(InboundRequestEntity)
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :id', { id: claim.id })
        .getOne();
      if (
        request?.status === 'processing' &&
        request.leaseOwner === claim.ownerToken
      ) {
        request.leaseExpiresAt = new Date();
        request.leaseOwner = null;
        request.lastError = message.slice(0, 256);
        await manager.getRepository(InboundRequestEntity).save(request);
      }
    });
  }

  private completedResult<TResponse extends Record<string, unknown>>(
    request: InboundRequestEntity,
    newlyCompleted: boolean,
  ): Extract<InboundExecution<never, TResponse>, { kind: 'completed' }> {
    if (
      request.status !== 'completed' ||
      request.responseStatus == null ||
      !request.responseBody
    ) {
      throw new Error('inbound_request_completion_missing');
    }
    return {
      kind: 'completed',
      httpStatus: request.responseStatus,
      body: request.responseBody as TResponse,
      newlyCompleted,
    };
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function retryAfterSeconds(expiresAt: Date | null, now: Date): number {
  if (!expiresAt) return 1;
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

function stableJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('inbound_request_not_json_serializable');
}
