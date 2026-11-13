import { IsString, IsUUID, Length } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @Length(20, 4096)
  refreshToken!: string;

  @IsUUID('4')
  deviceId!: string;
}
