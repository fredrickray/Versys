import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';
import { PrincipalService } from './principal.service';

@Module({
  imports: [UsersModule, RbacModule],
  providers: [PrincipalService],
  exports: [PrincipalService],
})
export class PrincipalModule {}
