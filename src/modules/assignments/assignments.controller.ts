import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { RejectAssignmentDto } from './dto/reject-assignment.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post('incidents/:incidentId/assignments')
  create(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.createOrSelfAssign(
      incidentId,
      user,
      dto.assigneeUserId,
    );
  }

  @Post('assignments/:assignmentId/accept')
  accept(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.accept(assignmentId, user);
  }

  @Post('assignments/:assignmentId/reject')
  reject(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: RejectAssignmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.reject(assignmentId, user, dto.reason, dto.note);
  }
}
