import { StaffCategory, UserCategory } from '../../common/enums';

/**
 * Deterministic local/CI personas for e2e and docker smoke.
 * Phones are reserved — never use these in production SMS.
 */
export const DEMO_USER_SEEDS = [
  {
    phoneE164: '+2348010000001',
    fullName: 'Demo Reporter',
    staffRoleKey: null as string | null,
    staffCategory: null as StaffCategory | null,
    userCategory: UserCategory.GENERAL,
    isDispatcher: false,
  },
  {
    phoneE164: '+2348010000002',
    fullName: 'Demo Sheriff Deputy',
    staffRoleKey: 'sheriff_deputy',
    staffCategory: StaffCategory.CAT_1,
    userCategory: UserCategory.SECURITY,
    isDispatcher: false,
  },
  {
    phoneE164: '+2348010000003',
    fullName: 'Demo Dispatcher',
    staffRoleKey: 'dispatcher',
    staffCategory: null as StaffCategory | null,
    userCategory: UserCategory.DISPATCHER,
    isDispatcher: true,
  },
] as const;

export type DemoUserKey = 'reporter' | 'sheriff' | 'dispatcher';

export const DEMO_PHONES: Record<DemoUserKey, string> = {
  reporter: DEMO_USER_SEEDS[0].phoneE164,
  sheriff: DEMO_USER_SEEDS[1].phoneE164,
  dispatcher: DEMO_USER_SEEDS[2].phoneE164,
};
