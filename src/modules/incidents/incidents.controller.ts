import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
@UseGuards(JwtAuthGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: AuthUser) {
    return this.incidents.create(dto, { userId: user.userId });
  }

  @Get()
  list(@Query('status') status?: IncidentStatus) {
    return this.incidents.list({ status });
  }

  @Get(':incidentId')
  async getOne(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new NotFoundException('incident_not_found');
    return incident;
  }
}
