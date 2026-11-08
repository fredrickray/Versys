import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { WebhookRateLimitGuard } from '../../../common/guards/webhook-rate-limit.guard';
import { WebhookSecretGuard } from '../../../common/guards/webhook-secret.guard';
import { UssdService } from './ussd.service';

class UssdWebhookDto {
  @IsOptional()
  @IsString()
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
@UseGuards(WebhookSecretGuard, WebhookRateLimitGuard)
export class UssdController {
  constructor(private readonly ussd: UssdService) {}

  @Post('session')
  session(@Body() dto: UssdWebhookDto) {
    return this.ussd.handle({
      sessionId: dto.sessionId,
      phoneE164: dto.phoneE164,
      text: dto.text ?? '',
      networkCode: dto.networkCode,
    });
  }
}
