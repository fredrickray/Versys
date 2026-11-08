import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { IncidentChannel } from '../../../common/enums';
import { WebhookRateLimitGuard } from '../../../common/guards/webhook-rate-limit.guard';
import { WebhookSecretGuard } from '../../../common/guards/webhook-secret.guard';
import { IncidentsService } from '../../incidents/incidents.service';
import { PlacesService } from '../../places/places.service';
import { ChannelsService } from '../channels.service';
import { parseInboundSms } from './sms-parser';

class InboundSmsDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  fromE164!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  providerMessageId?: string;
}

@Controller('channels/sms')
@UseGuards(WebhookSecretGuard, WebhookRateLimitGuard)
export class SmsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly places: PlacesService,
    private readonly channels: ChannelsService,
  ) {}

  @Post('inbound')
  async inbound(@Body() dto: InboundSmsDto) {
    const parsed = parseInboundSms(dto.body);
    if (!parsed) {
      await this.channels.sendSms({
        toE164: dto.fromE164,
        body: 'VERSYS: send TYPE PLACE e.g. FIRE HOSTEL_A or MED MED',
      });
      return { ok: false, reason: 'unparseable' };
    }

    const place = await this.places.findByCode(parsed.placeCode);
    if (!place) {
      await this.channels.sendSms({
        toE164: dto.fromE164,
        body: `VERSYS: unknown place ${parsed.placeCode}`,
      });
      return { ok: false, reason: 'unknown_place' };
    }

    const incident = await this.incidents.create(
      {
        type: parsed.type,
        channel: IncidentChannel.SMS,
        placeId: place.id,
        locationLabel: place.name,
        latitude: place.latitude ?? undefined,
        longitude: place.longitude ?? undefined,
        metadata: {
          smsRaw: parsed.raw,
          providerMessageId: dto.providerMessageId ?? null,
        },
      },
      { userId: null, phoneE164: dto.fromE164 },
    );

    await this.channels.sendSms({
      toE164: dto.fromE164,
      body: `VERSYS alert ${incident.publicCode} registered.`,
    });

    return {
      ok: true,
      publicCode: incident.publicCode,
      incidentId: incident.id,
    };
  }
}
