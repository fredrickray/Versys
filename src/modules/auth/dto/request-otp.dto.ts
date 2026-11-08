import { IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  /** E.164, e.g. +2348012345678 */
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;
}
