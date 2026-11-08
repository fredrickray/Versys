import { Permission, StaffCategory } from '../../../common/enums';
import { RbacService } from '../rbac.service';

describe('RbacService', () => {
  const rbac = new RbacService();

  it('keeps CAT1 from closing incidents', () => {
    expect(
      rbac.can(
        { staffCategory: StaffCategory.CAT_1, isDispatcher: false },
        Permission.CLOSE_INCIDENT,
      ),
    ).toBe(false);
  });

  it('gives CAT3 analytics and level-4 escalate', () => {
    expect(
      rbac.can(
        { staffCategory: StaffCategory.CAT_3, isDispatcher: false },
        Permission.VIEW_ANALYTICS,
      ),
    ).toBe(true);
    expect(
      rbac.can(
        { staffCategory: StaffCategory.CAT_3, isDispatcher: false },
        Permission.LEVEL4_ESCALATE,
      ),
    ).toBe(true);
  });

  it('dispatcher overlay can assign without being CAT3', () => {
    expect(
      rbac.can(
        { staffCategory: null, isDispatcher: true },
        Permission.DISPATCH_ASSIGN,
      ),
    ).toBe(true);
  });
});
