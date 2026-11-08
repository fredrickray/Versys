import type { DataSource } from 'typeorm';
import { ExternalContactEntity } from '../../modules/places/entities/external-contact.entity';
import { PlaceEntity } from '../../modules/places/entities/place.entity';
import { RoleEntity } from '../../modules/rbac/entities/role.entity';
import { UserEntity } from '../../modules/users/entities/user.entity';
import { DEMO_USER_SEEDS } from './demo-users.seed';
import { EXTERNAL_CONTACT_SEEDS } from './external-contacts.seed';
import { PLACE_SEEDS } from './places.seed';
import { ROLE_SEEDS } from './roles-permissions.seed';

export type SeedSummary = {
  roles: number;
  places: number;
  externalContacts: number;
  demoUsers: number;
};

/** Idempotent upsert of reference data + optional demo personas. */
export async function seedAll(
  ds: DataSource,
  opts: { demoUsers?: boolean } = {},
): Promise<SeedSummary> {
  const includeDemo = opts.demoUsers !== false;

  const roles = ds.getRepository(RoleEntity);
  for (const seed of ROLE_SEEDS) {
    const existing = await roles.findOne({ where: { key: seed.key } });
    if (existing) {
      existing.label = seed.label;
      existing.staffCategory = seed.staffCategory;
      existing.permissions = [...seed.permissions];
      await roles.save(existing);
    } else {
      await roles.save(
        roles.create({
          key: seed.key,
          label: seed.label,
          staffCategory: seed.staffCategory,
          permissions: [...seed.permissions],
        }),
      );
    }
  }

  const places = ds.getRepository(PlaceEntity);
  for (const seed of PLACE_SEEDS) {
    const existing = await places.findOne({ where: { code: seed.code } });
    if (existing) {
      existing.name = seed.name;
      existing.groupKey = seed.groupKey;
      existing.ussdNumber = seed.ussdNumber;
      existing.isMusterPoint = seed.isMusterPoint;
      existing.isActive = true;
      await places.save(existing);
    } else {
      await places.save(
        places.create({
          code: seed.code,
          name: seed.name,
          groupKey: seed.groupKey,
          ussdNumber: seed.ussdNumber,
          isMusterPoint: seed.isMusterPoint,
          isActive: true,
          isBlocked: false,
        }),
      );
    }
  }

  const contacts = ds.getRepository(ExternalContactEntity);
  for (const seed of EXTERNAL_CONTACT_SEEDS) {
    const existing = await contacts.findOne({ where: { key: seed.key } });
    if (existing) {
      existing.agencyName = seed.agencyName;
      existing.phoneE164 = seed.phoneE164;
      existing.isActive = true;
      await contacts.save(existing);
    } else {
      await contacts.save(
        contacts.create({
          key: seed.key,
          agencyName: seed.agencyName,
          phoneE164: seed.phoneE164,
          isActive: true,
        }),
      );
    }
  }

  let demoCount = 0;
  if (includeDemo) {
    const users = ds.getRepository(UserEntity);
    for (const seed of DEMO_USER_SEEDS) {
      const existing = await users.findOne({
        where: { phoneE164: seed.phoneE164 },
      });
      if (existing) {
        existing.fullName = seed.fullName;
        existing.staffRoleKey = seed.staffRoleKey;
        existing.staffCategory = seed.staffCategory;
        existing.userCategory = seed.userCategory;
        existing.isDispatcher = seed.isDispatcher;
        existing.isActive = true;
        await users.save(existing);
      } else {
        await users.save(
          users.create({
            phoneE164: seed.phoneE164,
            fullName: seed.fullName,
            staffRoleKey: seed.staffRoleKey,
            staffCategory: seed.staffCategory,
            userCategory: seed.userCategory,
            isDispatcher: seed.isDispatcher,
            isActive: true,
          }),
        );
      }
      demoCount += 1;
    }
  }

  return {
    roles: ROLE_SEEDS.length,
    places: PLACE_SEEDS.length,
    externalContacts: EXTERNAL_CONTACT_SEEDS.length,
    demoUsers: demoCount,
  };
}
