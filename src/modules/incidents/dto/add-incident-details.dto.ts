import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AddIncidentDetailsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;

  /** Cloudinary (or other https) URLs from POST /v1/media/upload. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photoUrls?: string[];
}
