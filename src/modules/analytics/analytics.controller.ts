import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.VIEW_ANALYTICS)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUser) {
    return this.analytics.summary(user, query);
  }

  @Get('incidents/:incidentId')
  incident(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.incidentInsights(user, incidentId);
  }
}
