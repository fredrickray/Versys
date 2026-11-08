import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
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

/** Aggregator USSD webhook — public, no JWT (secured by network allowlist later). */
@Controller('channels/ussd')
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
