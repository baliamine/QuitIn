import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_NEW, notificationEvents } from './notification-events';

interface CreateNotificationInput {
  type: NotificationType;
  message: string;
  actorId?: string;
  entityId?: string;
  /** Per-message events (e.g. chats) must never be collapsed. */
  dedupe?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async blockedActorIds(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
  }

  private async emitCreated(userId: string, notification: { id: string; type: NotificationType; message: string; entityId: string | null; createdAt: Date }, actorId: string | null) {
    const actor = actorId
      ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { username: true } })
      : null;
    notificationEvents.emit(NOTIFICATION_NEW, {
      userId,
      notification: {
        id: notification.id,
        type: notification.type,
        message: notification.message,
        entityId: notification.entityId,
        createdAt: notification.createdAt.toISOString(),
        read: false,
        actor,
      },
    });
  }

  async create(userId: string, input: CreateNotificationInput) {
    // Never notify a user about their own actions.
    if (input.actorId && input.actorId === userId) return null;

    // Blocking stops all further interactions, including notifications.
    if (input.actorId) {
      const block = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: input.actorId },
            { blockerId: input.actorId, blockedId: userId },
          ],
        },
        select: { id: true },
      });
      if (block) return null;
    }

    // Collapse repeated identical actions (e.g. toggling a like) into one
    // notification instead of filling the list with generic duplicates.
    if (input.actorId && input.dedupe !== false) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: input.type,
          actorId: input.actorId,
          entityId: input.entityId ?? null,
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        actorId: input.actorId ?? null,
        type: input.type,
        message: input.message,
        entityId: input.entityId ?? null,
      },
    });
    await this.emitCreated(userId, notification, input.actorId ?? null);
    return notification;
  }

  async listForUser(userId: string) {
    const blocked = await this.blockedActorIds(userId);
    return this.prisma.notification.findMany({
      where: {
        userId,
        OR: [{ actorId: null }, { actorId: { notIn: blocked } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            profile: { select: { avatarUrl: true, headline: true } },
          },
        },
      },
    });
  }

  async unreadCount(userId: string) {
    const blocked = await this.blockedActorIds(userId);
    const count = await this.prisma.notification.count({
      where: {
        userId,
        read: false,
        OR: [{ actorId: null }, { actorId: { notIn: blocked } }],
      },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { success: true };
  }
}
