import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffCategory, UserCategory } from '../../common/enums';
import { UserEntity } from './entities/user.entity';

export type UserProfile = {
  id: string;
  phoneE164: string;
  fullName: string | null;
  userCategory: UserCategory;
  staffCategory: StaffCategory | null;
  isDispatcher: boolean;
  isActive: boolean;
};

function toProfile(u: UserEntity): UserProfile {
  return {
    id: u.id,
    phoneE164: u.phoneE164,
    fullName: u.fullName,
    userCategory: u.userCategory,
    staffCategory: u.staffCategory,
    isDispatcher: u.isDispatcher,
    isActive: u.isActive,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id, isActive: true } });
  }

  async getProfile(id: string): Promise<UserProfile | null> {
    const user = await this.findById(id);
    return user ? toProfile(user) : null;
  }

  async updateProfile(
    id: string,
    patch: { fullName?: string },
  ): Promise<UserProfile | null> {
    const user = await this.findById(id);
    if (!user) return null;
    if (patch.fullName !== undefined) {
      user.fullName = patch.fullName.trim();
    }
    return toProfile(await this.users.save(user));
  }

  findByPhone(phoneE164: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { phoneE164, isActive: true } });
  }

  async findOrCreateByPhone(phoneE164: string): Promise<UserEntity> {
    const existing = await this.findByPhone(phoneE164);
    if (existing) return existing;
    const user = this.users.create({
      phoneE164,
      userCategory: UserCategory.GENERAL,
      isDispatcher: false,
      isActive: true,
    });
    return this.users.save(user);
  }

  async touchLastSeen(userId: string): Promise<void> {
    await this.users.update({ id: userId }, { lastSeenAt: new Date() });
  }

  findActiveByStaffRoles(roleKeys: string[]): Promise<UserEntity[]> {
    if (!roleKeys.length) return Promise.resolve([]);
    return this.users
      .createQueryBuilder('u')
      .where('u.is_active = true')
      .andWhere('u.staff_role_key IN (:...roleKeys)', { roleKeys })
      .getMany();
  }

  findActiveDispatchers(): Promise<UserEntity[]> {
    return this.users.find({ where: { isDispatcher: true, isActive: true } });
  }

  /** Staff with a category — for dispatcher assignment pickers. */
  listAssignableStaff(): Promise<UserEntity[]> {
    return this.users
      .createQueryBuilder('u')
      .where('u.is_active = true')
      .andWhere('u.staff_category IS NOT NULL')
      .orderBy('u.staff_category', 'ASC')
      .addOrderBy('u.full_name', 'ASC')
      .getMany();
  }
}
