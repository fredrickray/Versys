import { IsBoolean, IsOptional } from 'class-validator';

export class ResolveIncidentDto {
  /** true = final close (CAT2/3 or dispatcher@1h). false = confirm only. */
  @IsOptional()
  @IsBoolean()
  final?: boolean;
}
