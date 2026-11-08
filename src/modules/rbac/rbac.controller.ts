import { Controller, Get } from '@nestjs/common';
import { RbacService } from './rbac.service';

/** Phase 0 contract surface — front-end can bind against the live matrix. */
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('matrix')
  matrix() {
    return this.rbac.matrix();
  }
}
