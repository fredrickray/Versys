import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RejectionReason } from '../../../common/enums';

export class RejectAssignmentDto {
  @IsEnum(RejectionReason)
  reason!: RejectionReason;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}
