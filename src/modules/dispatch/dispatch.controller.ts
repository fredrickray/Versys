import {
  Body,
  Controller,
  Get,
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
import { RequirePermissions } from '../../common/decorators/require-permission.decorator';
import { Permission } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { DispatchAssignDto } from './dto/dispatch-assign.dto';
import { DispatchQueryDto } from './dto/dispatch-query.dto';
import { DispatchService } from './dispatch.service';

@Controller('dispatch')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.DISPATCH_ASSIGN)
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('board')
  board(@Query() query: DispatchQueryDto, @CurrentUser() user: AuthUser) {
    return this.dispatch.board(user, query);
  }

  @Get('staff')
  staff(@CurrentUser() user: AuthUser) {
    return this.dispatch.staffRoster(user);
  }

  @Get('incidents/:incidentId')
  detail(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatch.detail(user, incidentId);
  }

  @Post('incidents/:incidentId/assign')
  assign(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: DispatchAssignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatch.assign(user, incidentId, dto.assigneeUserId);
  }
}
