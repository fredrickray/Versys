import { StaffCategory } from '../../common/enums';
import {
  DISPATCHER_PERMISSIONS,
  STAFF_PERMISSIONS,
} from '../../common/constants/permissions';

export const ROLE_SEEDS = [
  {
    key: 'sheriff_deputy',
    label: 'Sheriff Deputy',
    staffCategory: StaffCategory.CAT_1,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_1]],
  },
  {
    key: 'hostel_administrator',
    label: 'Hostel Administrator',
    staffCategory: StaffCategory.CAT_1,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_1]],
  },
  {
    key: 'security_commander',
    label: 'Security Commander',
    staffCategory: StaffCategory.CAT_2,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_2]],
  },
  {
    key: 'deputy_dean',
    label: 'Deputy Dean',
    staffCategory: StaffCategory.CAT_2,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_2]],
  },
  {
    key: 'medical_a_and_e',
    label: 'Medical A&E',
    staffCategory: StaffCategory.CAT_2,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_2]],
  },
  {
    key: 'cmd',
    label: 'Chief Medical Director',
    staffCategory: StaffCategory.CAT_3,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_3]],
  },
  {
    key: 'dean_student_affairs',
    label: 'Dean of Student Affairs',
    staffCategory: StaffCategory.CAT_3,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_3]],
  },
  {
    key: 'management',
    label: 'University Management',
    staffCategory: StaffCategory.CAT_3,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_3]],
  },
  {
    key: 'cso',
    label: 'Chief Security Officer',
    staffCategory: StaffCategory.CAT_3,
    permissions: [...STAFF_PERMISSIONS[StaffCategory.CAT_3]],
  },
  {
    key: 'dispatcher',
    label: 'Dispatcher',
    staffCategory: null,
    permissions: [...DISPATCHER_PERMISSIONS],
  },
] as const;
