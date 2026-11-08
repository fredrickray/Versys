import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class Level4EscalateDto {
  @IsUUID()
  externalContactId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
