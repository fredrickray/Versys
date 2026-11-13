import { Body, Controller, Post } from '@nestjs/common';
import { IncidentChannel } from '../../common/enums';
import { CreateVisitorIncidentDto } from './dto/create-visitor-incident.dto';
import { IncidentsService } from './incidents.service';

/**
 * Public endpoint (no JwtAuthGuard): POST /v1/incidents/visitor.
 * Rate-limited per phone inside IncidentsService.create.
 */
@Controller('incidents/visitor')
export class VisitorIncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  create(@Body() dto: CreateVisitorIncidentDto) {
    const note = dto.note?.trim();
    return this.incidents.create(
      {
        type: dto.type,
        channel: IncidentChannel.VISITOR,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationLabel: dto.locationLabel,
        placeId: dto.placeId,
        metadata: note
          ? {
              reporterNotes: [
                { note, at: new Date().toISOString(), userId: null },
              ],
            }
          : {},
      },
      { userId: null, phoneE164: dto.phoneE164 },
    );
  }
}
