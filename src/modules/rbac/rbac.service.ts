import { Injectable } from '@nestjs/common';
import {
  DISPATCHER_PERMISSIONS,
  STAFF_PERMISSIONS,
  effectivePermissions,
  staffHasPermission,
} from '../../common/constants/permissions';
import { Permission, StaffCategory } from '../../common/enums';

@Injectable()
export class RbacService {
  permissionsFor(opts: {
    staffCategory: StaffCategory | null;
    isDispatcher: boolean;
  }): Permission[] {
    return [...effectivePermissions(opts)];
  }

  can(
    opts: { staffCategory: StaffCategory | null; isDispatcher: boolean },
    permission: Permission,
  ): boolean {
    return effectivePermissions(opts).has(permission);
  }

  matrix(): { staff: Record<string, Permission[]>; dispatcher: Permission[] } {
    return {
      staff: {
        [StaffCategory.CAT_1]: [...STAFF_PERMISSIONS[StaffCategory.CAT_1]],
        [StaffCategory.CAT_2]: [...STAFF_PERMISSIONS[StaffCategory.CAT_2]],
        [StaffCategory.CAT_3]: [...STAFF_PERMISSIONS[StaffCategory.CAT_3]],
      },
      dispatcher: [...DISPATCHER_PERMISSIONS],
    };
  }
}
