import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permission.decorator';
import { Permission } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { LocationPingDto } from './dto/location-ping.dto';
import { LocationService } from './location.service';
import { StaffShiftService } from './staff-shift.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LocationController {
  constructor(
    private readonly location: LocationService,
    private readonly shifts: StaffShiftService,
  ) {}

  @Post('location/shifts/start')
  startShift(@CurrentUser() user: AuthUser) {
    return this.shifts.start(user);
  }

  @Get('location/shifts/current')
  currentShift(@CurrentUser() user: AuthUser) {
    return this.shifts.current(user);
  }

  @Post('location/shifts/end')
  @HttpCode(204)
  async endShift(@CurrentUser() user: AuthUser): Promise<void> {
    await this.shifts.end(user);
  }

  @Post('location/ping')
  @HttpCode(202)
  ping(@Body() dto: LocationPingDto, @CurrentUser() user: AuthUser) {
    return this.location.ingest(user.userId, dto);
  }

  @Get('incidents/:incidentId/intervention-map')
  @RequirePermissions(Permission.MONITOR_INTERVENTION_MAP)
  interventionMap(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.location.interventionMap(incidentId, user);
  }
}
