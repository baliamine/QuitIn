import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateProfileDto, ExperienceDto, EducationDto } from './dto/profile.dto';

export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  createdAt: true,
  lastActiveAt: true,
  profile: {
    include: {
      skills: true,
      experiences: { orderBy: { startDate: 'desc' } },
      educations: { orderBy: { startDate: 'desc' } },
    },
  },
  _count: {
    select: { posts: true, followers: true, following: true },
  },
} satisfies Prisma.UserSelect;

const USER_CARD_SELECT = {
  id: true,
  username: true,
  lastActiveAt: true,
  profile: {
    select: { avatarUrl: true, headline: true, bio: true, location: true, visibility: true },
  },
  _count: { select: { followers: true, posts: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getProfileOrThrow(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.getProfileOrThrow(userId);
    const { skills, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      await tx.profile.update({ where: { id: profile.id }, data: rest });

      if (skills) {
        const cleaned = Array.from(
          new Set(skills.map((s) => s.trim()).filter((s) => s.length > 0)),
        );
        await tx.skill.deleteMany({ where: { profileId: profile.id } });
        if (cleaned.length > 0) {
          await tx.skill.createMany({
            data: cleaned.map((name) => ({ profileId: profile.id, name })),
          });
        }
      }

      return tx.profile.findUnique({
        where: { id: profile.id },
        include: { skills: true, experiences: true, educations: true },
      });
    });
  }

  async addExperience(userId: string, dto: ExperienceDto) {
    const profile = await this.getProfileOrThrow(userId);
    this.assertDates(dto.startDate, dto.endDate);
    return this.prisma.experience.create({
      data: {
        profileId: profile.id,
        title: dto.title,
        company: dto.company,
        location: dto.location,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        current: dto.current ?? false,
      },
    });
  }

  async updateExperience(userId: string, id: string, dto: ExperienceDto) {
    const profile = await this.getProfileOrThrow(userId);
    const experience = await this.prisma.experience.findUnique({ where: { id } });
    if (!experience || experience.profileId !== profile.id) {
      throw new ForbiddenException('You cannot modify this experience');
    }
    this.assertDates(dto.startDate, dto.endDate);
    return this.prisma.experience.update({
      where: { id },
      data: {
        title: dto.title,
        company: dto.company,
        location: dto.location,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        current: dto.current ?? false,
      },
    });
  }

  async deleteExperience(userId: string, id: string) {
    const profile = await this.getProfileOrThrow(userId);
    const experience = await this.prisma.experience.findUnique({ where: { id } });
    if (!experience || experience.profileId !== profile.id) {
      throw new ForbiddenException('You cannot delete this experience');
    }
    await this.prisma.experience.delete({ where: { id } });
    return { success: true };
  }

  async addEducation(userId: string, dto: EducationDto) {
    const profile = await this.getProfileOrThrow(userId);
    this.assertDates(dto.startDate, dto.endDate);
    return this.prisma.education.create({
      data: {
        profileId: profile.id,
        school: dto.school,
        degree: dto.degree,
        fieldOfStudy: dto.fieldOfStudy,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  async updateEducation(userId: string, id: string, dto: EducationDto) {
    const profile = await this.getProfileOrThrow(userId);
    const education = await this.prisma.education.findUnique({ where: { id } });
    if (!education || education.profileId !== profile.id) {
      throw new ForbiddenException('You cannot modify this education');
    }
    this.assertDates(dto.startDate, dto.endDate);
    return this.prisma.education.update({
      where: { id },
      data: {
        school: dto.school,
        degree: dto.degree,
        fieldOfStudy: dto.fieldOfStudy,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  async deleteEducation(userId: string, id: string) {
    const profile = await this.getProfileOrThrow(userId);
    const education = await this.prisma.education.findUnique({ where: { id } });
    if (!education || education.profileId !== profile.id) {
      throw new ForbiddenException('You cannot delete this education');
    }
    await this.prisma.education.delete({ where: { id } });
    return { success: true };
  }

  async getByUsername(username: string, currentUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [isFollowing, request, blockByMe, blockOfMe] = await Promise.all([
      currentUserId
        ? this.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: currentUserId,
                followingId: user.id,
              },
            },
            select: { id: true },
          })
        : null,
      currentUserId
        ? this.prisma.followRequest.findUnique({
            where: {
              requesterId_targetId: { requesterId: currentUserId, targetId: user.id },
            },
            select: { id: true },
          })
        : null,
      currentUserId
        ? this.prisma.block.findUnique({
            where: {
              blockerId_blockedId: { blockerId: currentUserId, blockedId: user.id },
            },
            select: { id: true },
          })
        : null,
      currentUserId
        ? this.prisma.block.findUnique({
            where: {
              blockerId_blockedId: { blockerId: user.id, blockedId: currentUserId },
            },
            select: { id: true },
          })
        : null,
    ]);

    const isSelf = user.id === currentUserId;

    return {
      ...user,
      isFollowing: Boolean(isFollowing),
      isRequested: Boolean(request),
      isBlockedByMe: Boolean(blockByMe),
      hasBlockedMe: Boolean(blockOfMe),
      canMessage: !blockByMe && !blockOfMe && !isSelf,
      isSelf,
    };
  }

  private async blockedIds(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
  }

  async search(currentUserId: string, q: string | undefined, take = 20, skip = 0) {
    const query = (q ?? '').trim();
    const blocked = await this.blockedIds(currentUserId);
    const where: Prisma.UserWhereInput = query
      ? {
          AND: [
            { id: { not: currentUserId } },
            blocked.length ? { id: { notIn: blocked } } : {},
            {
              OR: [
                { username: { contains: query, mode: 'insensitive' } },
                { profile: { is: { headline: { contains: query, mode: 'insensitive' } } } },
                { profile: { is: { bio: { contains: query, mode: 'insensitive' } } } },
                { profile: { is: { skills: { some: { name: { contains: query, mode: 'insensitive' } } } } } },
              ],
            },
          ],
        }
      : {
          AND: [
            { id: { not: currentUserId } },
            blocked.length ? { id: { notIn: blocked } } : {},
          ],
        };

    const users = await this.prisma.user.findMany({
      where,
      select: USER_CARD_SELECT,
      take: Math.min(take, 50),
      skip,
      orderBy: { createdAt: 'desc' },
    });
    return { users };
  }

  async suggestions(currentUserId: string, take = 5) {
    // Recommend users the current user does not already follow.
    const following = await this.prisma.follow.findMany({
      where: { followerId: currentUserId },
      select: { followingId: true },
    });
    const blocked = await this.blockedIds(currentUserId);
    const excluded = [currentUserId, ...following.map((f) => f.followingId), ...blocked];

    const users = await this.prisma.user.findMany({
      where: { id: { notIn: excluded } },
      select: USER_CARD_SELECT,
      take,
      orderBy: [{ followers: { _count: 'desc' } }, { createdAt: 'desc' }],
    });
    return { users };
  }

  async toggleFollow(followerId: string, username: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, profile: { select: { visibility: true } } },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.id === followerId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: followerId, blockedId: target.id },
          { blockerId: target.id, blockedId: followerId },
        ],
      },
      select: { id: true },
    });
    if (blocked) {
      throw new ForbiddenException('You cannot follow this user');
    }

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId: target.id } },
    });

    if (existing) {
      await this.prisma.follow.delete({ where: { id: existing.id } });
      return { following: false, requested: false };
    }

    const pendingRequest = await this.prisma.followRequest.findUnique({
      where: { requesterId_targetId: { requesterId: followerId, targetId: target.id } },
    });
    if (pendingRequest) {
      await this.prisma.followRequest.delete({ where: { id: pendingRequest.id } });
      return { following: false, requested: false };
    }

    if (target.profile?.visibility === 'PRIVATE') {
      await this.prisma.followRequest.create({
        data: { requesterId: followerId, targetId: target.id },
      });
      await this.notifications.create(target.id, {
        type: 'FOLLOW_REQUEST',
        actorId: followerId,
        message: 'requested to follow you',
        entityId: followerId,
      });
      return { following: false, requested: true };
    }

    await this.prisma.follow.create({
      data: { followerId, followingId: target.id },
    });
    await this.notifications.create(target.id, {
      type: 'FOLLOW',
      actorId: followerId,
      message: 'started following you',
      entityId: followerId,
    });
    return { following: true, requested: false };
  }

  async followRequests(userId: string) {
    const rows = await this.prisma.followRequest.findMany({
      where: { targetId: userId },
      orderBy: { createdAt: 'desc' },
      include: { requester: { select: USER_CARD_SELECT } },
    });
    return {
      requests: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        user: r.requester,
      })),
    };
  }

  async acceptFollowRequest(userId: string, requestId: string) {
    const request = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.targetId !== userId) {
      throw new NotFoundException('Follow request not found');
    }
    await this.prisma.$transaction([
      this.prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: request.requesterId,
            followingId: request.targetId,
          },
        },
        update: {},
        create: { followerId: request.requesterId, followingId: request.targetId },
      }),
      this.prisma.followRequest.delete({ where: { id: request.id } }),
    ]);
    await this.notifications.create(request.requesterId, {
      type: 'FOLLOW_ACCEPTED',
      actorId: userId,
      message: 'accepted your follow request',
      entityId: userId,
    });
    return { success: true };
  }

  async rejectFollowRequest(userId: string, requestId: string) {
    const request = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.targetId !== userId) {
      throw new NotFoundException('Follow request not found');
    }
    await this.prisma.followRequest.delete({ where: { id: request.id } });
    return { success: true };
  }

  async block(userId: string, username: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === userId) throw new BadRequestException('You cannot block yourself');

    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: target.id } },
        update: {},
        create: { blockerId: userId, blockedId: target.id },
      }),
      this.prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: userId, followingId: target.id },
            { followerId: target.id, followingId: userId },
          ],
        },
      }),
      this.prisma.followRequest.deleteMany({
        where: {
          OR: [
            { requesterId: userId, targetId: target.id },
            { requesterId: target.id, targetId: userId },
          ],
        },
      }),
    ]);

    return { blocked: true };
  }

  async unblock(userId: string, username: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');
    await this.prisma.block.deleteMany({
      where: { blockerId: userId, blockedId: target.id },
    });
    return { blocked: false };
  }

  async listBlocked(userId: string) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { select: USER_CARD_SELECT } },
    });
    return { users: rows.map((r) => r.blocked) };
  }

  async reportUser(userId: string, username: string, reason: string, details?: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === userId) throw new BadRequestException('You cannot report yourself');
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: 'USER',
        targetId: target.id,
        reason,
        details,
      },
    });
    return { success: true };
  }

  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect password');
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  async followers(username: string, currentUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const rows = await this.prisma.follow.findMany({
      where: { followingId: user.id },
      include: { follower: { select: USER_CARD_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return { users: rows.map((r) => r.follower) };
  }

  async following(username: string, currentUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const rows = await this.prisma.follow.findMany({
      where: { followerId: user.id },
      include: { following: { select: USER_CARD_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return { users: rows.map((r) => r.following) };
  }

  private assertDates(start?: string, end?: string) {
    if (start && end && new Date(end) < new Date(start)) {
      throw new BadRequestException('End date cannot be before start date');
    }
  }
}
