import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { DevicePlatform } from '../entities/device-token.entity';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string;

  @IsIn(['ios', 'android', 'web'])
  platform!: DevicePlatform;
}
