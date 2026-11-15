import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { RequirePermissions } from '../../common/decorators/require-permission.decorator';
import { IncidentStatus, Permission } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AddIncidentDetailsDto } from './dto/add-incident-details.dto';
import { CreateDrillDto } from './dto/create-drill.dto';
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
  create(
    @Body() dto: CreateIncidentDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.incidents.createIdempotent(
      dto,
      { userId: user.userId },
      'incident_api',
      requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post('drills')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_DRILLS)
  createDrill(
    @Body() dto: CreateDrillDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { purpose, ...incident } = dto;
    return this.incidents.createIdempotent(
      incident,
      { userId: user.userId },
      'incident_drill',
      requireIdempotencyKey(idempotencyKey),
      { isDrill: true, drillPurpose: purpose },
    );
  }

  /** Phone offline queue flush — idempotent per clientEventId. */
  @Post('offline')
  @HttpCode(202)
  offlineFlush(@Body() dto: OfflineAlertDto, @CurrentUser() user: AuthUser) {
    return this.offline.enqueue(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: IncidentStatus,
  ) {
    return this.incidents.listForActor(user, { status });
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
  getOne(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incidents.findOneForActor(incidentId, user);
  }
}

function requireIdempotencyKey(value?: string): string {
  const key = value?.trim() ?? '';
  if (!key || key.length > 120 || !/^[A-Za-z0-9._-]+$/.test(key)) {
    throw new BadRequestException('invalid_idempotency_key');
  }
  return key;
}
