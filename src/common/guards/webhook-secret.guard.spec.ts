import {
  type ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelSimulatorGuard } from './channel-simulator.guard';
import { WebhookSecretGuard } from './webhook-secret.guard';

function context(secret?: string | string[]): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { 'x-versys-webhook-secret': secret },
      }),
    }),
  } as unknown as ExecutionContext;
}

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('WebhookSecretGuard', () => {
  it('allows a missing local secret', () => {
    const guard = new WebhookSecretGuard(config({ channelWebhookSecret: '' }));
    expect(guard.canActivate(context())).toBe(true);
  });

  it('accepts only a matching single-value secret', () => {
    const guard = new WebhookSecretGuard(
      config({ channelWebhookSecret: 'correct-secret-with-enough-length' }),
    );

    expect(
      guard.canActivate(context('correct-secret-with-enough-length')),
    ).toBe(true);
    expect(() => guard.canActivate(context('wrong-secret'))).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      guard.canActivate(context(['correct-secret-with-enough-length'])),
    ).toThrow(UnauthorizedException);
  });
});

describe('ChannelSimulatorGuard', () => {
  it('hides inbound routes when simulator mode is disabled', () => {
    expect(
      new ChannelSimulatorGuard(
        config({ channelSimulatorOnly: true }),
      ).canActivate(context()),
    ).toBe(true);
    expect(() =>
      new ChannelSimulatorGuard(
        config({ channelSimulatorOnly: false }),
      ).canActivate(context()),
    ).toThrow(NotFoundException);
  });
});
