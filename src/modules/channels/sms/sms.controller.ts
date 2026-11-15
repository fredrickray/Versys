import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import type { Response } from 'express';
import type { EntityManager } from 'typeorm';
import { ChannelSimulatorGuard } from '../../../common/guards/channel-simulator.guard';
import { WebhookRateLimitGuard } from '../../../common/guards/webhook-rate-limit.guard';
import { WebhookSecretGuard } from '../../../common/guards/webhook-secret.guard';
import { IncidentChannel, type IncidentType } from '../../../common/enums';
import { IncidentsService } from '../../incidents/incidents.service';
import type { IncidentEntity } from '../../incidents/entities/incident.entity';
import { PlacesService } from '../../places/places.service';
import { ChannelsService } from '../channels.service';
import {
  InboundIdempotencyService,
  InboundRequestInProgressException,
} from '../inbound-idempotency.service';
import { parseInboundSms } from './sms-parser';

class InboundSmsDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  fromE164!: string;

  @IsString()
  body!: string;

  @IsString()
  @Length(1, 160)
  @Matches(/\S/)
  providerMessageId!: string;
}

type SmsResponse =
  | { ok: true; publicCode: string; incidentId: string }
  | { ok: false; reason: 'unparseable' | 'unknown_place' };

type SmsCommand =
  | {
      kind: 'unparseable';
      fromE164: string;
      rawBody: string;
      providerMessageId: string;
      reply: string;
    }
  | {
      kind: 'unknown_place';
      fromE164: string;
      rawBody: string;
      providerMessageId: string;
      placeCode: string;
      reply: string;
    }
  | {
      kind: 'incident';
      fromE164: string;
      rawBody: string;
      providerMessageId: string;
      type: IncidentType;
      placeId: string;
      placeName: string;
      placeCode: string;
      latitude: number | null;
      longitude: number | null;
      reply: string;
    };

type SmsCompletion = {
  incident: IncidentEntity | null;
  toE164: string;
  reply: string;
};

@Controller('channels/sms')
@UseGuards(ChannelSimulatorGuard, WebhookSecretGuard, WebhookRateLimitGuard)
export class SmsController {
  private readonly logger = new Logger(SmsController.name);

  constructor(
    private readonly incidents: IncidentsService,
    private readonly places: PlacesService,
    private readonly channels: ChannelsService,
    private readonly idempotency: InboundIdempotencyService,
  ) {}

  @Post('inbound')
  @HttpCode(HttpStatus.OK)
  async inbound(
    @Body() dto: InboundSmsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SmsResponse> {
    try {
      const stored = await this.idempotency.findStoredRequest<SmsCommand>(
        'sms',
        dto.providerMessageId,
      );
      const command =
        stored &&
        stored.fromE164 === dto.fromE164 &&
        stored.rawBody === dto.body &&
        stored.providerMessageId === dto.providerMessageId
          ? stored
          : await this.toCommand(dto);
      const result = await this.idempotency.execute(
        'sms',
        dto.providerMessageId,
        command,
        (manager, storedCommand) => this.complete(manager, storedCommand),
        command.kind === 'incident'
          ? () =>
              this.incidents.assertRateLimit({
                phoneE164: command.fromE164,
                userId: null,
              })
          : undefined,
      );
      const completed = this.idempotency.ensureCompleted(result);

      if (completed.newlyCompleted && completed.value) {
        await this.publishPostCommitEffects(completed.value);
      }
      return completed.body;
    } catch (error) {
      if (error instanceof InboundRequestInProgressException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  private async toCommand(dto: InboundSmsDto): Promise<SmsCommand> {
    const parsed = parseInboundSms(dto.body);
    if (!parsed) {
      return {
        kind: 'unparseable',
        fromE164: dto.fromE164,
        rawBody: dto.body,
        providerMessageId: dto.providerMessageId,
        reply: 'VERSYS: send TYPE PLACE e.g. FIRE HOSTEL_A or MED MED',
      };
    }

    const place = await this.places.findByCode(parsed.placeCode);
    if (!place) {
      return {
        kind: 'unknown_place',
        fromE164: dto.fromE164,
        rawBody: dto.body,
        providerMessageId: dto.providerMessageId,
        placeCode: parsed.placeCode,
        reply: `VERSYS: unknown place ${parsed.placeCode}`,
      };
    }

    return {
      kind: 'incident',
      fromE164: dto.fromE164,
      rawBody: dto.body,
      providerMessageId: dto.providerMessageId,
      type: parsed.type,
      placeId: place.id,
      placeName: place.name,
      placeCode: place.code,
      latitude: place.latitude,
      longitude: place.longitude,
      reply: 'registered',
    };
  }

  private async complete(
    manager: EntityManager,
    command: SmsCommand,
  ): Promise<{
    httpStatus: number;
    body: SmsResponse;
    incidentId?: string | null;
    value: SmsCompletion;
  }> {
    if (command.kind === 'unparseable' || command.kind === 'unknown_place') {
      return {
        httpStatus: HttpStatus.OK,
        body: { ok: false, reason: command.kind },
        value: {
          incident: null,
          toE164: command.fromE164,
          reply: command.reply,
        },
      };
    }

    const incident = await this.incidents.createWithinTransaction(
      {
        type: command.type,
        channel: IncidentChannel.SMS,
        placeId: command.placeId,
        locationLabel: command.placeName,
        latitude: command.latitude ?? undefined,
        longitude: command.longitude ?? undefined,
        metadata: {
          smsRaw: command.rawBody,
          providerMessageId: command.providerMessageId,
        },
      },
      { userId: null, phoneE164: command.fromE164 },
      manager,
    );
    const reply = `VERSYS alert ${incident.publicCode} ${command.reply}.`;
    return {
      httpStatus: HttpStatus.OK,
      body: {
        ok: true,
        publicCode: incident.publicCode,
        incidentId: incident.id,
      },
      incidentId: incident.id,
      value: { incident, toE164: command.fromE164, reply },
    };
  }

  private async publishPostCommitEffects(
    completion: SmsCompletion,
  ): Promise<void> {
    try {
      if (completion.incident) {
        this.incidents.publishCreated(completion.incident);
      }
      await this.channels.sendSms({
        toE164: completion.toE164,
        body: completion.reply,
        purpose: 'general',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Inbound SMS post-commit effect failed: ${message}`);
    }
  }
}
