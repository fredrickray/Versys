import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DeviceTokenEntity,
  type DevicePlatform,
} from './entities/device-token.entity';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(DeviceTokenEntity)
    private readonly tokens: Repository<DeviceTokenEntity>,
  ) {}

  async register(
    userId: string,
    token: string,
    platform: DevicePlatform,
  ): Promise<DeviceTokenEntity> {
    const existing = await this.tokens.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      existing.lastSeenAt = new Date();
      return this.tokens.save(existing);
    }
    return this.tokens.save(
      this.tokens.create({
        userId,
        token,
        platform,
        lastSeenAt: new Date(),
      }),
    );
  }

  async unregister(
    userId: string,
    token: string,
  ): Promise<{ removed: boolean }> {
    const result = await this.tokens.delete({ userId, token });
    return { removed: (result.affected ?? 0) > 0 };
  }

  findTokensForUser(userId: string): Promise<DeviceTokenEntity[]> {
    return this.tokens.find({ where: { userId } });
  }

  findTokensForUsers(userIds: string[]): Promise<DeviceTokenEntity[]> {
    if (!userIds.length) return Promise.resolve([]);
    return this.tokens.find({ where: { userId: In(userIds) } });
  }

  async removeTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    await this.tokens.delete({ token: In(tokens) });
  }
}
