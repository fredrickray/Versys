import {
  Body,
  Controller,
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
import { Level4EscalateDto } from './dto/level4.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { EscalationService } from './escalation.service';

@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EscalationController {
  constructor(private readonly escalation: EscalationService) {}

  @Post(':incidentId/escalate')
  @RequirePermissions(Permission.CONFIRM_OR_ESCALATE_ASSIGNED)
  escalate(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.escalation.manualEscalate(incidentId, user);
  }

  @Post(':incidentId/resolve')
  resolve(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: ResolveIncidentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.escalation.resolve(incidentId, user, dto.final === true);
  }

  @Post(':incidentId/level4')
  @RequirePermissions(Permission.LEVEL4_ESCALATE)
  level4(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: Level4EscalateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.escalation.recordLevel4(
      incidentId,
      user,
      dto.externalContactId,
      dto.note,
    );
  }
}
