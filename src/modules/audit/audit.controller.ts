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
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FalseAlarmService } from './false-alarm.service';

class FalseAlarmQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  hours?: number;
}

class FlagFalseAlarmDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly falseAlarms: FalseAlarmService) {}

  @Get('false-alarms')
  falseAlarmsList(
    @Query() query: FalseAlarmQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.falseAlarms.candidates(user, query.hours ?? 24);
  }

  @Post('false-alarms/:incidentId/flag')
  flag(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: FlagFalseAlarmDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.falseAlarms.flag(user, {
      incidentId,
      note: dto.note,
    });
  }
}
