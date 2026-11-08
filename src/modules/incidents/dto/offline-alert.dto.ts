import {
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IncidentChannel, IncidentType } from '../../../common/enums';
import { IsEnum } from 'class-validator';

export class OfflineAlertDto {
  /** Client-generated idempotency key for retries */
  @IsString()
  @MaxLength(64)
  clientEventId!: string;

  @IsEnum(IncidentType)
  type!: IncidentType;

  @IsEnum(IncidentChannel)
  channel!: IncidentChannel;

  @IsISO8601()
  capturedAt!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsUUID()
  placeId?: string;

  @IsOptional()
  @IsString()
  locationLabel?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
