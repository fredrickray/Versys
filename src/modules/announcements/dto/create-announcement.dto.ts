import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserCategory } from '../../../common/enums';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(UserCategory, { each: true })
  targetCategories!: UserCategory[];
}
