import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Protects public aggregator webhooks when CHANNEL_WEBHOOK_SECRET is set.
 * Expects header: x-versys-webhook-secret
 */
@Injectable()
export class WebhookSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('channelWebhookSecret') ?? '';
    if (!expected) return true; // unset in local/dev

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    const provided = req.headers['x-versys-webhook-secret'];
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('invalid_webhook_secret');
    }
    return true;
  }
}
