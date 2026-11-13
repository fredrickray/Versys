import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Response } from 'express';
import { ChannelSimulatorGuard } from '../../../common/guards/channel-simulator.guard';
import { WebhookRateLimitGuard } from '../../../common/guards/webhook-rate-limit.guard';
import { WebhookSecretGuard } from '../../../common/guards/webhook-secret.guard';
import { InboundRequestInProgressException } from '../inbound-idempotency.service';
import { UssdService } from './ussd.service';

class UssdWebhookDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  sessionId?: string;

  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  networkCode?: string;
}

@Controller('channels/ussd')
@UseGuards(ChannelSimulatorGuard, WebhookSecretGuard, WebhookRateLimitGuard)
export class UssdController {
  constructor(private readonly ussd: UssdService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  async session(
    @Body() dto: UssdWebhookDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.ussd.handle({
        sessionId: dto.sessionId,
        phoneE164: dto.phoneE164,
        text: dto.text ?? '',
        networkCode: dto.networkCode,
      });
    } catch (error) {
      if (error instanceof InboundRequestInProgressException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }
}
