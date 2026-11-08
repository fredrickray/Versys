import { IsUUID } from 'class-validator';

export class DispatchAssignDto {
  @IsUUID()
  assigneeUserId!: string;
}
