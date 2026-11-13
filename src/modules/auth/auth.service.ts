import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditAction } from '../../common/enums';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { ChannelsService } from '../channels/channels.service';
import { RbacService } from '../rbac/rbac.service';
import { UserEntity } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import type { RefreshTokenPayload, TokenResponse } from './auth.types';
import { RefreshSessionEntity } from './entities/refresh-session.entity';
import type { JwtPayload } from './strategies/jwt.strategy';

type RefreshResult = { ok: true; tokens: TokenResponse } | { ok: false };

const CONSUME_OTP_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly rbac: RbacService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly channels: ChannelsService,
    private readonly dataSource: DataSource,
  ) {}

  async requestOtp(phoneE164: string): Promise<{ expiresInSeconds: number }> {
    const throttleKey = `otp:throttle:${phoneE164}`;
    const throttled = await this.redis.client.get(throttleKey);
    if (throttled) {
      throw new HttpException('otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }

    const length = this.config.getOrThrow<number>('otp.length');
    const ttl = this.config.getOrThrow<number>('otp.ttlSeconds');
    const testCode = this.config.get<string>('otp.testCode');
    const code =
      this.config.get<string>('nodeEnv') === 'test' && testCode
        ? testCode
        : String(randomInt(0, 10 ** length)).padStart(length, '0');
    const salt = randomBytes(16).toString('hex');

    await this.redis.client.set(
      `otp:${phoneE164}`,
      encodeOtp(code, salt),
      'EX',
      ttl,
    );
    await this.redis.client.set(throttleKey, '1', 'EX', 30);

    const sms = await this.channels.sendSms({
      toE164: phoneE164,
      body: `VERSYS code: ${code}. Expires in ${Math.ceil(ttl / 60)} min. Do not share.`,
      purpose: 'otp',
      correlationId: `otp:${phoneE164}`,
    });

    if (!sms.ok) {
      this.logger.warn(
        `OTP SMS failed for ${phoneE164}: ${sms.error ?? 'unknown'}`,
      );
      if (this.config.get<string>('smsProvider') !== 'mock') {
        throw new HttpException('otp_sms_failed', HttpStatus.BAD_GATEWAY);
      }
    }

    return { expiresInSeconds: ttl };
  }

  async verifyOtp(
    phoneE164: string,
    code: string,
    deviceId: string,
  ): Promise<TokenResponse> {
    const consumed = await this.consumeOtp(phoneE164, code);
    if (!consumed) {
      await this.audit.append({
        action: AuditAction.AUTH_FAILED,
        metadata: { phoneE164, reason: 'invalid_otp' },
      });
      throw new UnauthorizedException('invalid_otp');
    }

    const user = await this.users.findOrCreateByPhone(phoneE164);
    if (!user.isActive) {
      await this.audit.append({
        action: AuditAction.AUTH_FAILED,
        actorUserId: user.id,
        metadata: { phoneE164, reason: 'account_inactive' },
      });
      throw new UnauthorizedException('account_inactive');
    }
    await this.users.touchLastSeen(user.id);

    const accessToken = await this.signAccessToken(user);
    const accessTtl = this.config.getOrThrow<string>('jwt.accessTtl');
    const refreshTtlSeconds = parseDurationSeconds(
      this.config.getOrThrow<string>('jwt.refreshTtl'),
    );
    const sessionId = randomUUID();
    const refreshToken = await this.signRefreshToken(
      user.id,
      sessionId,
      refreshTtlSeconds,
    );
    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    await this.dataSource.transaction(async (manager) => {
      const sessions = manager.getRepository(RefreshSessionEntity);
      await sessions.save(
        sessions.create({
          id: sessionId,
          userId: user.id,
          currentTokenHash: hashToken(refreshToken),
          deviceId,
          expiresAt,
          lastRotatedAt: null,
          revokedAt: null,
          revokedReason: null,
        }),
      );
      await this.audit.append(
        {
          action: AuditAction.AUTH_LOGIN,
          actorUserId: user.id,
          resourceType: 'refresh_session',
          resourceId: sessionId,
          metadata: { phoneE164 },
        },
        manager,
      );
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  async refresh(
    refreshToken: string,
    deviceId: string,
  ): Promise<TokenResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const presentedHash = hashToken(refreshToken);

    const result = await this.dataSource.transaction<RefreshResult>(
      async (manager) => {
        const sessions = manager.getRepository(RefreshSessionEntity);
        const session = await sessions
          .createQueryBuilder('session')
          .setLock('pessimistic_write')
          .where('session.id = :id', { id: payload.sid })
          .getOne();

        if (!session || session.revokedAt) return { ok: false };

        const now = new Date();
        if (session.expiresAt.getTime() <= now.getTime()) {
          await this.revokeSession(manager, session, 'expired');
          return { ok: false };
        }
        if (payload.sub !== session.userId) {
          await this.revokeSession(manager, session, 'subject_mismatch');
          return { ok: false };
        }
        if (!tokenHashesEqual(presentedHash, session.currentTokenHash)) {
          await this.revokeSession(manager, session, 'reuse_detected');
          return { ok: false };
        }
        if (deviceId !== session.deviceId) {
          await this.revokeSession(manager, session, 'device_mismatch');
          return { ok: false };
        }

        const user = await manager.getRepository(UserEntity).findOne({
          where: { id: session.userId },
        });
        if (!user?.isActive) {
          await this.revokeSession(manager, session, 'account_inactive');
          return { ok: false };
        }

        const remainingSeconds = Math.floor(
          (session.expiresAt.getTime() - now.getTime()) / 1000,
        );
        if (remainingSeconds < 1) {
          await this.revokeSession(manager, session, 'expired');
          return { ok: false };
        }

        const replacement = await this.signRefreshToken(
          user.id,
          session.id,
          remainingSeconds,
        );
        session.currentTokenHash = hashToken(replacement);
        session.lastRotatedAt = now;
        await sessions.save(session);

        await this.audit.append(
          {
            action: AuditAction.AUTH_REFRESH,
            actorUserId: user.id,
            resourceType: 'refresh_session',
            resourceId: session.id,
          },
          manager,
        );

        return {
          ok: true,
          tokens: {
            accessToken: await this.signAccessToken(user),
            refreshToken: replacement,
            expiresIn: this.config.getOrThrow<string>('jwt.accessTtl'),
          },
        };
      },
    );

    if (!result.ok) throw new UnauthorizedException('invalid_refresh_token');
    return result.tokens;
  }

  private async consumeOtp(phoneE164: string, code: string): Promise<boolean> {
    const key = `otp:${phoneE164}`;
    const stored = await this.redis.client.get(key);
    if (!stored) return false;
    const separator = stored.indexOf(':');
    if (separator < 1) return false;
    const salt = stored.slice(0, separator);
    const candidate = encodeOtp(code, salt);
    const consumed = await this.redis.client.eval(
      CONSUME_OTP_SCRIPT,
      1,
      key,
      candidate,
    );
    return Number(consumed) === 1;
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
          algorithms: ['HS256'],
        },
      );
      if (
        payload.typ !== 'refresh' ||
        !payload.sub ||
        !payload.sid ||
        !payload.jti
      ) {
        throw new Error('invalid_refresh_claims');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('invalid_refresh_token');
    }
  }

  private async signAccessToken(user: UserEntity): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      typ: 'access',
      staffCategory: user.staffCategory,
      isDispatcher: user.isDispatcher,
      permissions: this.rbac.permissionsFor({
        staffCategory: user.staffCategory,
        isDispatcher: user.isDispatcher,
      }),
    };
    const accessTtl = this.config.getOrThrow<string>('jwt.accessTtl');
    const accessTtlSeconds = parseDurationSeconds(accessTtl);
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      algorithm: 'HS256',
      expiresIn: accessTtlSeconds,
    });
  }

  private signRefreshToken(
    userId: string,
    sessionId: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const payload: RefreshTokenPayload = {
      sub: userId,
      typ: 'refresh',
      sid: sessionId,
      jti: randomUUID(),
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      algorithm: 'HS256',
      expiresIn: expiresInSeconds,
    });
  }

  private async revokeSession(
    manager: EntityManager,
    session: RefreshSessionEntity,
    reason: string,
  ): Promise<void> {
    session.revokedAt = new Date();
    session.revokedReason = reason;
    await manager.getRepository(RefreshSessionEntity).save(session);
    await this.audit.append(
      {
        action: AuditAction.AUTH_SESSION_REVOKED,
        actorUserId: session.userId,
        resourceType: 'refresh_session',
        resourceId: session.id,
        metadata: { reason },
      },
      manager,
    );
  }
}

function encodeOtp(code: string, salt: string): string {
  const digest = scryptSync(code, salt, 32).toString('hex');
  return `${salt}:${digest}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function tokenHashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`invalid_jwt_duration:${value}`);
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error(`invalid_jwt_duration:${value}`);
  }
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[
    match[2] as 's' | 'm' | 'h' | 'd'
  ];
  return amount * multiplier;
}
