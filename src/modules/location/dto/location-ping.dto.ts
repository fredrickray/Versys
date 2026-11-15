import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class LocationPingDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsNumber()
  @Min(0)
  accuracyMetres!: number;

  @IsOptional()
  @IsUUID()
  incidentId?: string;

  @IsISO8601()
  recordedAt!: string;
}
