import { AlertLevel, Permission, StaffCategory } from '../enums';

/**
 * Single permission matrix (spec §4).
 * Alert level ≠ staff category ≠ user category — keep them separate at call sites.
 */
export const STAFF_PERMISSIONS: Readonly<
  Record<StaffCategory, ReadonlySet<Permission>>
> = {
  [StaffCategory.CAT_1]: new Set([
    Permission.READ_MESSAGES,
    Permission.VIEW_MUSTER_MAP,
    Permission.VIEW_NAVIGATION_MAP,
    Permission.ACCEPT_REJECT_INTERVENTION,
    Permission.CONFIRM_OR_ESCALATE_ASSIGNED,
  ]),
  [StaffCategory.CAT_2]: new Set([
    Permission.READ_MESSAGES,
    Permission.VIEW_MUSTER_MAP,
    Permission.VIEW_NAVIGATION_MAP,
    Permission.ACCEPT_REJECT_INTERVENTION,
    Permission.CONFIRM_OR_ESCALATE_ASSIGNED,
    Permission.CLOSE_INCIDENT,
    Permission.MONITOR_INTERVENTION_MAP,
    Permission.PUSH_ANNOUNCEMENTS_OWN,
  ]),
  [StaffCategory.CAT_3]: new Set([
    Permission.READ_MESSAGES,
    Permission.VIEW_MUSTER_MAP,
    Permission.VIEW_NAVIGATION_MAP,
    Permission.ACCEPT_REJECT_INTERVENTION,
    Permission.CONFIRM_OR_ESCALATE_ASSIGNED,
    Permission.CLOSE_INCIDENT,
    Permission.MONITOR_INTERVENTION_MAP,
    Permission.PUSH_ANNOUNCEMENTS_OWN,
    Permission.PUSH_ANNOUNCEMENTS_ANY,
    Permission.VIEW_ANALYTICS,
    Permission.LEVEL4_ESCALATE,
    Permission.MANAGE_USERS,
  ]),
};

/** Dispatcher is a role overlay, not a staff category. */
export const DISPATCHER_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.READ_MESSAGES,
  Permission.VIEW_MUSTER_MAP,
  Permission.VIEW_NAVIGATION_MAP,
  Permission.MONITOR_INTERVENTION_MAP,
  Permission.DISPATCH_ASSIGN,
  Permission.CLOSE_INCIDENT,
  Permission.LEVEL4_ESCALATE,
  Permission.VIEW_ANALYTICS,
]);

/** Who is notified when an incident is at a given alert level. */
export const ALERT_LEVEL_NOTIFY_ROLES: Readonly<
  Record<AlertLevel, readonly string[]>
> = {
  [AlertLevel.LOW]: ['sheriff_deputy', 'hostel_administrator'],
  [AlertLevel.MID]: [
    'security_commander',
    'deputy_dean',
    'medical_a_and_e',
    'cmd',
  ],
  [AlertLevel.HIGH]: ['dean_student_affairs', 'management'],
  [AlertLevel.ULTRA]: [], // phone contact list only — no push fan-out
};

export function staffHasPermission(
  category: StaffCategory,
  permission: Permission,
): boolean {
  return STAFF_PERMISSIONS[category].has(permission);
}

export function effectivePermissions(opts: {
  staffCategory: StaffCategory | null;
  isDispatcher: boolean;
}): Set<Permission> {
  // General authenticated users (reporters) may read announcements and muster places.
  const perms = new Set<Permission>([
    Permission.VIEW_NAVIGATION_MAP,
    Permission.READ_MESSAGES,
    Permission.VIEW_MUSTER_MAP,
  ]);

  if (opts.staffCategory != null) {
    for (const p of STAFF_PERMISSIONS[opts.staffCategory]) {
      perms.add(p);
    }
  }
  if (opts.isDispatcher) {
    for (const p of DISPATCHER_PERMISSIONS) {
      perms.add(p);
    }
  }
  return perms;
}
