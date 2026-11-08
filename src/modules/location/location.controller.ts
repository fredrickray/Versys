import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LocationPingDto } from './dto/location-ping.dto';
import { LocationService } from './location.service';

@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(private readonly location: LocationService) {}

  @Post('ping')
  @HttpCode(202)
  ping(@Body() dto: LocationPingDto, @CurrentUser() user: AuthUser) {
    return this.location.ingest(user.userId, dto);
  }
}
