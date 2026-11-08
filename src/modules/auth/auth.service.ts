import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import { AuditAction } from '../../common/enums';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { ChannelsService } from '../channels/channels.service';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from './strategies/jwt.strategy';

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
  ) {}

  async requestOtp(phoneE164: string): Promise<{ expiresInSeconds: number }> {
    const throttleKey = `otp:throttle:${phoneE164}`;
    const throttled = await this.redis.client.get(throttleKey);
    if (throttled) {
      throw new HttpException('otp_rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }

    const length = this.config.getOrThrow<number>('otp.length');
    const ttl = this.config.getOrThrow<number>('otp.ttlSeconds');
    const code = String(randomInt(0, 10 ** length)).padStart(length, '0');

    await this.redis.client.set(`otp:${phoneE164}`, code, 'EX', ttl);
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
      // Fail closed when a live provider is configured so clients don't assume delivery
      if (this.config.get<string>('smsProvider') !== 'mock') {
        throw new HttpException('otp_sms_failed', HttpStatus.BAD_GATEWAY);
      }
    }

    // Dev/test convenience — never log OTP in production
    if (this.config.get<string>('nodeEnv') !== 'production') {
      this.logger.log(`OTP for ${phoneE164}: ${code}`);
    }

    return { expiresInSeconds: ttl };
  }

  async verifyOtp(
    phoneE164: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const stored = await this.redis.client.get(`otp:${phoneE164}`);
    if (!stored || stored !== code) {
      await this.audit.append({
        action: AuditAction.AUTH_FAILED,
        metadata: { phoneE164, reason: 'invalid_otp' },
      });
      throw new UnauthorizedException('invalid_otp');
    }

    await this.redis.client.del(`otp:${phoneE164}`);
    const user = await this.users.findOrCreateByPhone(phoneE164);
    await this.users.touchLastSeen(user.id);

    const permissions = this.rbac.permissionsFor({
      staffCategory: user.staffCategory,
      isDispatcher: user.isDispatcher,
    });

    const payload: JwtPayload = {
      sub: user.id,
      staffCategory: user.staffCategory,
      isDispatcher: user.isDispatcher,
      permissions,
    };

    const accessTtl = this.config.getOrThrow<string>('jwt.accessTtl');
    const refreshTtl = this.config.getOrThrow<string>('jwt.refreshTtl');

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: accessTtl as `${number}m`,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: refreshTtl as `${number}d`,
      },
    );

    await this.audit.append({
      action: AuditAction.AUTH_LOGIN,
      actorUserId: user.id,
      metadata: { phoneE164 },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }
}
