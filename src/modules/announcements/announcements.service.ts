import { ForbiddenException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditAction, Permission, UserCategory } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { UserEntity } from '../users/entities/user.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { AnnouncementEntity } from './entities/announcement.entity';

export type AnnouncementWithAuthor = AnnouncementEntity & {
  authorName: string | null;
};

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(AnnouncementEntity)
    private readonly announcements: Repository<AnnouncementEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    actor: AuthUser,
    dto: CreateAnnouncementDto,
  ): Promise<AnnouncementWithAuthor> {
    const any = actor.permissions.includes(Permission.PUSH_ANNOUNCEMENTS_ANY);
    const own = actor.permissions.includes(Permission.PUSH_ANNOUNCEMENTS_OWN);
    if (!any && !own) {
      throw new ForbiddenException('cannot_push_announcements');
    }
    // CAT2 "own sub-categories" — Phase 2: allow listed targets; tighten mapping later
    if (
      !any &&
      dto.targetCategories.includes(UserCategory.UNIVERSITY_MANAGEMENT)
    ) {
      throw new ForbiddenException('cannot_target_management');
    }

    const row = await this.announcements.save(
      this.announcements.create({
        authorUserId: actor.userId,
        title: dto.title,
        body: dto.body,
        targetCategories: dto.targetCategories,
        publishedAt: new Date(),
      }),
    );

    const recipients = await this.users.find({
      where: {
        isActive: true,
        userCategory: In(dto.targetCategories),
      },
    });

    await this.audit.append({
      action: AuditAction.ANNOUNCEMENT_SENT,
      actorUserId: actor.userId,
      resourceType: 'announcement',
      resourceId: row.id,
      metadata: {
        targetCategories: dto.targetCategories,
        recipientCount: recipients.length,
      },
    });

    if (recipients.length) {
      this.events.emit('incident.notify_targets', {
        incidentId: null,
        userIds: recipients.map((u) => u.id),
        alertLevel: 0,
        publicCode: 'ANNOUNCE',
        type: 'announcement',
        title: dto.title,
        body: dto.body,
        announcementId: row.id,
        blinkingBlue: true,
      });
    }

    const [withAuthor] = await this.withAuthorNames([row]);
    return withAuthor;
  }

  async listForUser(
    _user: AuthUser,
    limit = 50,
  ): Promise<AnnouncementWithAuthor[]> {
    // Inbox: announcements targeting the user's category or GENERAL broadcast list
    const rows = await this.announcements
      .createQueryBuilder('a')
      .orderBy('a.published_at', 'DESC')
      .take(limit)
      .getMany();
    return this.withAuthorNames(rows);
  }

  private async withAuthorNames(
    rows: AnnouncementEntity[],
  ): Promise<AnnouncementWithAuthor[]> {
    const ids = [...new Set(rows.map((r) => r.authorUserId))];
    const authors = ids.length
      ? await this.users.find({ where: { id: In(ids) } })
      : [];
    const names = new Map(authors.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({
      ...r,
      authorName: names.get(r.authorUserId) ?? null,
    }));
  }
}
