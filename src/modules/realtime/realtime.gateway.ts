import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { RealtimeAccessService } from './realtime-access.service';
import type { RealtimeEnvelope } from './realtime-envelope';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SocketData = { userId?: string };

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly seenEventIds = new Set<string>();

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly access: RealtimeAccessService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then(() => next())
        .catch(() => next(new Error('unauthorized')));
    });
  }

  handleConnection(client: Socket): void {
    const userId = (client.data as SocketData).userId;
    this.logger.debug(`socket connected ${client.id} user=${userId ?? 'none'}`);
  }

  @SubscribeMessage('subscribe:incident')
  async subscribeIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { incidentId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const incidentId = body?.incidentId;
    if (!incidentId || !UUID_PATTERN.test(incidentId)) {
      return { ok: false, error: 'forbidden' };
    }

    try {
      const principal = await this.currentPrincipal(client);
      if (!(await this.access.canViewIncident(principal, incidentId))) {
        return { ok: false, error: 'forbidden' };
      }
      await client.join(`incident:${incidentId}`);
      return { ok: true };
    } catch {
      client.disconnect(true);
      return { ok: false, error: 'unauthorized' };
    }
  }

  @SubscribeMessage('subscribe:dispatch')
  async subscribeDispatch(
    @ConnectedSocket() client: Socket,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const principal = await this.currentPrincipal(client);
      if (!this.access.hasDispatchAccess(principal)) {
        return { ok: false, error: 'forbidden' };
      }
      await client.join('dispatch');
      return { ok: true };
    } catch {
      client.disconnect(true);
      return { ok: false, error: 'unauthorized' };
    }
  }

  async deliver(envelope: RealtimeEnvelope): Promise<void> {
    if (this.seenEventIds.has(envelope.eventId)) return;
    this.remember(envelope.eventId);

    if (envelope.type === 'authz.changed') {
      const changedUserId = envelope.payload['userId'];
      if (typeof changedUserId === 'string') {
        for (const socket of this.server.sockets.values()) {
          if ((socket.data as SocketData).userId === changedUserId) {
            socket.disconnect(true);
          }
        }
      }
      return;
    }

    for (const socket of this.server.sockets.values()) {
      await this.deliverToSocket(socket, envelope);
    }
  }

  private async authenticate(socket: Socket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) throw new Error('missing_token');
    const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      algorithms: ['HS256'],
    });
    if (!payload.sub || payload.typ !== 'access') {
      throw new Error('invalid_token');
    }
    const principal = await this.access.resolvePrincipal(payload.sub);
    (socket.data as SocketData).userId = principal.userId;
  }

  private extractToken(socket: Socket): string | null {
    const authToken = (socket.handshake.auth as Record<string, unknown>)[
      'token'
    ];
    if (typeof authToken === 'string' && authToken) return authToken;

    const authorization = socket.handshake.headers.authorization;
    if (typeof authorization !== 'string') return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match?.[1] ?? null;
  }

  private async currentPrincipal(client: Socket) {
    const userId = (client.data as SocketData).userId;
    if (!userId) throw new Error('unauthenticated_socket');
    return this.access.resolvePrincipal(userId);
  }

  private async deliverToSocket(
    socket: Socket,
    envelope: RealtimeEnvelope,
  ): Promise<void> {
    let principal;
    try {
      principal = await this.currentPrincipal(socket);
    } catch {
      socket.disconnect(true);
      return;
    }

    let authorized = false;
    if (socket.rooms.has('dispatch')) {
      if (this.access.hasDispatchAccess(principal)) {
        authorized = true;
      } else {
        await socket.leave('dispatch');
      }
    }

    if (envelope.incidentId) {
      const incidentRoom = `incident:${envelope.incidentId}`;
      if (socket.rooms.has(incidentRoom)) {
        if (await this.access.canViewIncident(principal, envelope.incidentId)) {
          authorized = true;
        } else {
          await socket.leave(incidentRoom);
        }
      }
    }

    if (authorized) socket.emit(envelope.type, envelope);
  }

  private remember(eventId: string): void {
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size <= 1_000) return;
    const oldest = this.seenEventIds.values().next().value as
      string | undefined;
    if (oldest) this.seenEventIds.delete(oldest);
  }
}
