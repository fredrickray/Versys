import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** Mobile registers FCM/APNs registration token after login. */
  @Post('tokens')
  register(@Body() dto: RegisterDeviceDto, @CurrentUser() user: AuthUser) {
    return this.devices.register(user.userId, dto.token, dto.platform);
  }

  @Delete('tokens')
  @HttpCode(204)
  async unregister(
    @Body() dto: UnregisterDeviceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.devices.unregister(user.userId, dto.token);
  }
}
