import { IsString, Length } from 'class-validator';
import { CreateIncidentDto } from './create-incident.dto';

export class CreateDrillDto extends CreateIncidentDto {
  @IsString()
  @Length(3, 240)
  purpose!: string;
}
