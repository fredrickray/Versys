import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterDeviceDto {
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string;
}
