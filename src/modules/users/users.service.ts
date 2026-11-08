import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserCategory } from '../../common/enums';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id, isActive: true } });
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
}
