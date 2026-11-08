import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      ip?: string;
      headers: Record<string, string | undefined>;
    }>();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const limit = this.config.getOrThrow<number>('rateLimitWebhooksPerMinute');
    const key = `rate:webhook:${ip}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 60);
    if (count > limit) {
      throw new HttpException(
        'webhook_rate_limited',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
