import { IsOptional, IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  /** Dispatcher assign; omit to self-volunteer / self-accept path */
  @IsOptional()
  @IsUUID()
  assigneeUserId?: string;
}
