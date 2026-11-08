import { Injectable, Logger } from '@nestjs/common';
import { IncidentChannel, IncidentType } from '../../../common/enums';
import { IncidentsService } from '../../incidents/incidents.service';
import { ChannelsService } from '../channels.service';
import {
  USSD_LOCATION_GROUPS,
  PlacesService,
} from '../../places/places.service';
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
  text: string; // latest user input; empty on first dial
  networkCode?: string;
};

export type UssdWebhookResponse = {
  sessionId: string;
  message: string;
  end: boolean;
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
  ) {}

  async handle(input: UssdWebhookInput): Promise<UssdWebhookResponse> {
    const text = (input.text ?? '').trim();

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

    if (text === '0') {
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
      if (session.step === 'confirm') {
        session.step = 'place';
        const places = await this.places.listByGroup(session.groupKey!);
        await this.sessions.save(session);
        return {
          sessionId: session.sessionId,
          message: buildPlaceMenu(places),
          end: false,
        };
      }
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
      (g) => String(g.ussdNumber) === text,
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
    const n = Number(text);
    if (!Number.isFinite(n) || !session.groupKey) {
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
      n,
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

    const incident = await this.incidents.create(
      {
        type: session.type ?? IncidentType.SUSPICIOUS_MOVEMENT,
        channel: IncidentChannel.USSD,
        placeId: session.placeId,
        locationLabel: session.placeName,
        latitude: place?.latitude ?? undefined,
        longitude: place?.longitude ?? undefined,
        metadata: { ussd: true, placeCode: session.placeCode },
      },
      { userId: null, phoneE164: session.phoneE164 },
    );

    await this.channels.sendSms({
      toE164: session.phoneE164,
      body: `VERSYS alert ${incident.publicCode} registered. Help is being notified.`,
    });

    await this.sessions.clear(session.sessionId);
    this.logger.log(
      `USSD incident ${incident.publicCode} from ${session.phoneE164}`,
    );

    return {
      sessionId: session.sessionId,
      message: `OK ${incident.publicCode}. SMS sent.`,
      end: true,
    };
  }
}
