import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService, type UserProfile } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    const profile = await this.users.getProfile(user.userId);
    if (!profile) throw new NotFoundException('user_not_found');
    return profile;
  }

  @Patch('me')
  async updateMe(
    @Body() dto: UpdateMeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserProfile> {
    const profile = await this.users.updateProfile(user.userId, dto);
    if (!profile) throw new NotFoundException('user_not_found');
    return profile;
  }
}
