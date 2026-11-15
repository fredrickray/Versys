import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PrincipalService {
  constructor(
    private readonly users: UsersService,
    private readonly rbac: RbacService,
  ) {}

  async resolve(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('invalid_token');

    return {
      userId: user.id,
      staffCategory: user.staffCategory,
      userCategory: user.userCategory,
      isDispatcher: user.isDispatcher,
      permissions: this.rbac.permissionsFor({
        staffCategory: user.staffCategory,
        isDispatcher: user.isDispatcher,
      }),
    };
  }
}
