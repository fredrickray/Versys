import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { IncidentStatus } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AddIncidentDetailsDto } from './dto/add-incident-details.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { OfflineAlertDto } from './dto/offline-alert.dto';
import { IncidentsService } from './incidents.service';
import { OfflineAlertsService } from './offline-alerts.service';

@Controller('incidents')
@UseGuards(JwtAuthGuard)
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly offline: OfflineAlertsService,
  ) {}

  @Post()
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: AuthUser) {
    return this.incidents.create(dto, { userId: user.userId });
  }

  /** Phone offline queue flush — idempotent per clientEventId. */
  @Post('offline')
  @HttpCode(202)
  offlineFlush(@Body() dto: OfflineAlertDto, @CurrentUser() user: AuthUser) {
    return this.offline.enqueue(user, dto);
  }

  @Get()
  list(@Query('status') status?: IncidentStatus) {
    return this.incidents.list({ status });
  }

  /** Reporter (or any staff / dispatcher) appends a note to the incident. */
  @Patch(':incidentId/details')
  addDetails(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: AddIncidentDetailsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incidents.addDetails(incidentId, dto, user);
  }

  @Get(':incidentId')
  async getOne(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new NotFoundException('incident_not_found');
    return incident;
  }
}
