import { Injectable, Logger } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { IncidentChannel, IncidentType } from '../../../common/enums';
import type { IncidentEntity } from '../../incidents/entities/incident.entity';
import { IncidentsService } from '../../incidents/incidents.service';
import {
  PlacesService,
  USSD_LOCATION_GROUPS,
} from '../../places/places.service';
import { ChannelsService } from '../channels.service';
import {
  InboundIdempotencyService,
  InboundRequestConflictException,
} from '../inbound-idempotency.service';
import {
  buildConfirmMenu,
  buildGroupMenu,
  buildPlaceMenu,
  buildTypeMenu,
} from './ussd-menu.builder';
import { UssdSessionService, type UssdSession } from './ussd-session.service';

export type UssdWebhookInput = {
  sessionId?: string;
  phoneE164: string;
  text: string;
  networkCode?: string;
};

export type UssdWebhookResponse = {
  sessionId: string;
  message: string;
  end: boolean;
};

type UssdConfirmationCommand = {
  sessionId: string;
  phoneE164: string;
  type: IncidentType;
  placeId: string | null;
  placeName: string | null;
  placeCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

type UssdCompletion = {
  incident: IncidentEntity;
  toE164: string;
  reply: string;
};

const TYPE_MAP: Record<string, { type: IncidentType; label: string }> = {
  '1': { type: IncidentType.FIRE, label: 'Fire' },
  '2': { type: IncidentType.FIGHT, label: 'Fight' },
  '3': { type: IncidentType.ACCIDENT, label: 'Medical' },
  '4': { type: IncidentType.ONGOING_CRIME, label: 'Crime' },
  '5': { type: IncidentType.SUSPICIOUS_MOVEMENT, label: 'Other' },
};

@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);

  constructor(
    private readonly sessions: UssdSessionService,
    private readonly places: PlacesService,
    private readonly incidents: IncidentsService,
    private readonly channels: ChannelsService,
    private readonly idempotency: InboundIdempotencyService,
  ) {}

  async handle(input: UssdWebhookInput): Promise<UssdWebhookResponse> {
    const text = (input.text ?? '').trim();

    if (input.sessionId && text === '1') {
      const stored =
        await this.idempotency.findStoredRequest<UssdConfirmationCommand>(
          'ussd_confirmation',
          input.sessionId,
        );
      if (stored) {
        if (stored.phoneE164 !== input.phoneE164) {
          throw new InboundRequestConflictException();
        }
        return this.processConfirmation(stored);
      }
    }

    let session: UssdSession | null = input.sessionId
      ? await this.sessions.get(input.sessionId)
      : null;

    if (!session) {
      session = await this.sessions.start(input.phoneE164);
      return {
        sessionId: session.sessionId,
        message: buildTypeMenu(),
        end: false,
      };
    }
    if (session.phoneE164 !== input.phoneE164) {
      throw new InboundRequestConflictException();
    }

    if (text === '0') {
      return this.goBackOrCancel(session);
    }

    switch (session.step) {
      case 'type':
        return this.onType(session, text);
      case 'group':
        return this.onGroup(session, text);
      case 'place':
        return this.onPlace(session, text);
      case 'confirm':
        return this.onConfirm(session, text);
      default:
        await this.sessions.clear(session.sessionId);
        return {
          sessionId: session.sessionId,
          message: 'Session error. Dial again.',
          end: true,
        };
    }
  }

  private async goBackOrCancel(
    session: UssdSession,
  ): Promise<UssdWebhookResponse> {
    if (session.step === 'type') {
      await this.sessions.clear(session.sessionId);
      return {
        sessionId: session.sessionId,
        message: 'Cancelled.',
        end: true,
      };
    }
    if (session.step === 'group') {
      session.step = 'type';
      await this.sessions.save(session);
      return {
        sessionId: session.sessionId,
        message: buildTypeMenu(),
        end: false,
      };
    }
    if (session.step === 'place') {
      session.step = 'group';
      await this.sessions.save(session);
      return {
        sessionId: session.sessionId,
        message: buildGroupMenu(),
        end: false,
      };
    }

    session.step = 'place';
    const places = await this.places.listByGroup(session.groupKey!);
    await this.sessions.save(session);
    return {
      sessionId: session.sessionId,
      message: buildPlaceMenu(places),
      end: false,
    };
  }

  private async onType(
    session: UssdSession,
    text: string,
  ): Promise<UssdWebhookResponse> {
    const mapped = TYPE_MAP[text];
    if (!mapped) {
      return {
        sessionId: session.sessionId,
        message: buildTypeMenu(),
        end: false,
      };
    }
    session.type = mapped.type;
    session.typeLabel = mapped.label;
    session.step = 'group';
    await this.sessions.save(session);
    return {
      sessionId: session.sessionId,
      message: buildGroupMenu(),
      end: false,
    };
  }

  private async onGroup(
    session: UssdSession,
    text: string,
  ): Promise<UssdWebhookResponse> {
    const group = USSD_LOCATION_GROUPS.find(
      (entry) => String(entry.ussdNumber) === text,
    );
    if (!group) {
      return {
        sessionId: session.sessionId,
        message: buildGroupMenu(),
        end: false,
      };
    }
    session.groupKey = group.key;
    session.step = 'place';
    await this.sessions.save(session);
    const places = await this.places.listByGroup(group.key);
    return {
      sessionId: session.sessionId,
      message: buildPlaceMenu(places),
      end: false,
    };
  }

  private async onPlace(
    session: UssdSession,
    text: string,
  ): Promise<UssdWebhookResponse> {
    const number = Number(text);
    if (!Number.isFinite(number) || !session.groupKey) {
      const places = await this.places.listByGroup(
        session.groupKey ?? 'hostels',
      );
      return {
        sessionId: session.sessionId,
        message: buildPlaceMenu(places),
        end: false,
      };
    }
    const place = await this.places.findByGroupAndUssdNumber(
      session.groupKey,
      number,
    );
    if (!place) {
      const places = await this.places.listByGroup(session.groupKey);
      return {
        sessionId: session.sessionId,
        message: buildPlaceMenu(places),
        end: false,
      };
    }
    session.placeId = place.id;
    session.placeName = place.name;
    session.placeCode = place.code;
    session.step = 'confirm';
    await this.sessions.save(session);
    return {
      sessionId: session.sessionId,
      message: buildConfirmMenu(session.typeLabel ?? 'Alert', place.name),
      end: false,
    };
  }

  private async onConfirm(
    session: UssdSession,
    text: string,
  ): Promise<UssdWebhookResponse> {
    if (text !== '1') {
      await this.sessions.clear(session.sessionId);
      return {
        sessionId: session.sessionId,
        message: 'Cancelled.',
        end: true,
      };
    }

    const place = session.placeId
      ? await this.places.findPlaceById(session.placeId)
      : null;
    return this.processConfirmation({
      sessionId: session.sessionId,
      phoneE164: session.phoneE164,
      type: session.type ?? IncidentType.SUSPICIOUS_MOVEMENT,
      placeId: session.placeId ?? null,
      placeName: session.placeName ?? null,
      placeCode: session.placeCode ?? null,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
    });
  }

  private async processConfirmation(
    command: UssdConfirmationCommand,
  ): Promise<UssdWebhookResponse> {
    const result = await this.idempotency.execute(
      'ussd_confirmation',
      command.sessionId,
      command,
      (manager, storedCommand) =>
        this.completeConfirmation(manager, storedCommand),
      () =>
        this.incidents.assertRateLimit({
          phoneE164: command.phoneE164,
          userId: null,
        }),
    );
    const completed = this.idempotency.ensureCompleted(result);

    if (completed.newlyCompleted && completed.value) {
      await this.publishPostCommitEffects(completed.value);
    }
    await this.sessions.clear(command.sessionId);
    return completed.body;
  }

  private async completeConfirmation(
    manager: EntityManager,
    command: UssdConfirmationCommand,
  ): Promise<{
    httpStatus: number;
    body: UssdWebhookResponse;
    incidentId: string;
    value: UssdCompletion;
  }> {
    const incident = await this.incidents.createWithinTransaction(
      {
        type: command.type,
        channel: IncidentChannel.USSD,
        placeId: command.placeId ?? undefined,
        locationLabel: command.placeName ?? undefined,
        latitude: command.latitude ?? undefined,
        longitude: command.longitude ?? undefined,
        metadata: { ussd: true, placeCode: command.placeCode },
      },
      { userId: null, phoneE164: command.phoneE164 },
      manager,
    );
    const reply = `VERSYS alert ${incident.publicCode} registered. Help is being notified.`;
    return {
      httpStatus: 200,
      body: {
        sessionId: command.sessionId,
        message: `OK ${incident.publicCode}. SMS sent.`,
        end: true,
      },
      incidentId: incident.id,
      value: { incident, toE164: command.phoneE164, reply },
    };
  }

  private async publishPostCommitEffects(
    completion: UssdCompletion,
  ): Promise<void> {
    try {
      this.incidents.publishCreated(completion.incident);
      await this.channels.sendSms({
        toE164: completion.toE164,
        body: completion.reply,
        purpose: 'general',
      });
      this.logger.log(
        `USSD incident ${completion.incident.publicCode} from ${completion.toE164}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`USSD post-commit effect failed: ${message}`);
    }
  }
}
