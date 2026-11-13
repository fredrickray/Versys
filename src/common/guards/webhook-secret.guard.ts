import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

/**
 * Protects simulator webhooks with x-versys-webhook-secret.
 * Local development and tests may omit the secret. Staging and production reject
 * empty secrets during configuration validation.
 */
@Injectable()
export class WebhookSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('channelWebhookSecret') ?? '';
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const provided = req.headers['x-versys-webhook-secret'];
    if (typeof provided !== 'string' || !secretsEqual(provided, expected)) {
      throw new UnauthorizedException('invalid_webhook_secret');
    }
    return true;
  }
}

function secretsEqual(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}
