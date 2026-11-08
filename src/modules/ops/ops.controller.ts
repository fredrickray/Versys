import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OpsService } from './ops.service';

@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  /** Tech-desk snapshot — JWT required so it is not a public intel leak. */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  status() {
    return this.ops.deskStatus();
  }
}
