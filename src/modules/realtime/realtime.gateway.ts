import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { IncidentEvent } from '../../common/events/incident.events';
import { AssignmentEvent } from '../../common/events/assignment.events';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`socket connected ${client.id}`);
  }

  @SubscribeMessage('subscribe:incident')
  subscribeIncident(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { incidentId?: string },
  ) {
    if (!body?.incidentId) return { ok: false };
    void client.join(`incident:${body.incidentId}`);
    return { ok: true };
  }

  @SubscribeMessage('subscribe:dispatch')
  subscribeDispatch(@ConnectedSocket() client: Socket) {
    void client.join('dispatch');
    return { ok: true };
  }

  @OnEvent(IncidentEvent.CREATED)
  onIncidentCreated(payload: { incidentId: string }): void {
    this.server.to('dispatch').emit('incident.created', payload);
  }

  @OnEvent('realtime.incident_updated')
  onIncidentUpdated(payload: { incidentId: string }): void {
    this.server
      .to(`incident:${payload.incidentId}`)
      .to('dispatch')
      .emit('incident.updated', payload);
  }

  @OnEvent(AssignmentEvent.ACCEPTED)
  onAccepted(payload: unknown): void {
    this.server.to('dispatch').emit('assignment.accepted', payload);
  }

  @OnEvent(AssignmentEvent.REJECTED)
  onRejected(payload: unknown): void {
    this.server.to('dispatch').emit('assignment.rejected', payload);
  }
}
