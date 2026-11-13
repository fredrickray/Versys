import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  /** Random installation UUID generated and retained by the client. */
  @IsUUID('4')
  deviceId!: string;
}
