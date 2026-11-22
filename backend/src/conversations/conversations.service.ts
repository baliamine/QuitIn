import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttachmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateConversationDto,
  MessageAttachmentDto,
  SendMessageDto,
} from './dto/conversation.dto';

const PARTICIPANT_SELECT = {
  select: {
    id: true,
    username: true,
    lastActiveAt: true,
    profile: { select: { avatarUrl: true, headline: true, visibility: true } },
  },
} satisfies Prisma.UserArgs;

const MESSAGE_INCLUDE = {
  sender: PARTICIPANT_SELECT,
  attachments: { orderBy: { createdAt: 'asc' } },
  reactions: { select: { userId: true, emoji: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      sender: { select: { id: true, username: true } },
    },
  },
} satisfies Prisma.MessageInclude;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(currentUserId: string, opts: { archived?: boolean; q?: string } = {}) {
    const q = opts.q?.trim();
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: currentUserId,
            deletedAt: null,
            archivedAt: opts.archived ? { not: null } : null,
          },
        },
        ...(q
          ? {
              participants: {
                some: {
                  userId: currentUserId,
                  deletedAt: null,
                  archivedAt: opts.archived ? { not: null } : null,
                  user: { username: { contains: q, mode: 'insensitive' } },
                },
              },
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        participants: { include: { user: PARTICIPANT_SELECT } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: PARTICIPANT_SELECT },
        },
        _count: {
          select: {
            messages: {
              where: {
                readAt: null,
                deletedAt: null,
                senderId: { not: currentUserId },
              },
            },
          },
        },
      },
    });

    return {
      conversations: conversations.map((c) => this.toSummary(c, currentUserId)),
    };
  }

  private toSummary(conversation: any, currentUserId: string) {
    const others = conversation.participants
      .map((p: any) => p.user)
      .filter((u: any) => u.id !== currentUserId);
    const last = conversation.messages?.[0] ?? null;
    const me = conversation.participants.find((p: any) => p.userId === currentUserId);
    return {
      id: conversation.id,
      updatedAt: conversation.updatedAt,
      participants: conversation.participants.map((p: any) => p.user),
      otherParticipants: others,
      lastMessage: last,
      unreadCount: conversation._count?.messages ?? 0,
      archived: Boolean(me?.archivedAt),
      muted: Boolean(me?.muted),
    };
  }

  private async assertNotBlocked(userId: string, targetId: string) {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetId },
          { blockerId: targetId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    if (block) {
      throw new ForbiddenException('You cannot message this user');
    }
  }

  /** Enforces the target user's "who can message me" privacy setting. */
  private async assertMessagingAllowed(currentUserId: string, targetId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { profile: { select: { messagingPermission: true } } },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.profile?.messagingPermission === 'FOLLOWERS') {
      const follows = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: { followerId: currentUserId, followingId: targetId },
        },
        select: { id: true },
      });
      if (!follows) {
        throw new ForbiddenException(
          'This user only accepts messages from people they follow',
        );
      }
    }
  }

  async findOrCreate(currentUserId: string, dto: CreateConversationDto) {
    let targetId = dto.userId;
    if (!targetId && dto.username) {
      const target = await this.prisma.user.findUnique({
        where: { username: dto.username.toLowerCase() },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('User not found');
      targetId = target.id;
    }
    if (!targetId) {
      throw new BadRequestException('userId or username is required');
    }
    if (targetId === currentUserId) {
      throw new BadRequestException('You cannot start a conversation with yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.assertNotBlocked(currentUserId, targetId);
    await this.assertMessagingAllowed(currentUserId, targetId);

    // Find an existing 1:1 conversation between these two users.
    const existing = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetId } } },
        ],
      },
      include: {
        participants: { include: { user: PARTICIPANT_SELECT } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: PARTICIPANT_SELECT },
        },
        _count: {
          select: {
            messages: {
              where: { readAt: null, deletedAt: null, senderId: { not: currentUserId } },
            },
          },
        },
      },
    });

    if (existing) {
      // Restore the conversation for the current user if they had deleted it.
      await this.prisma.conversationParticipant.updateMany({
        where: { conversationId: existing.id, userId: currentUserId },
        data: { deletedAt: null, archivedAt: null },
      });
      return { conversation: this.toSummary(existing, currentUserId), created: false };
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: currentUserId }, { userId: targetId }],
        },
      },
      include: {
        participants: { include: { user: PARTICIPANT_SELECT } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: PARTICIPANT_SELECT },
        },
        _count: {
          select: {
            messages: {
              where: { readAt: null, deletedAt: null, senderId: { not: currentUserId } },
            },
          },
        },
      },
    });

    return { conversation: this.toSummary(conversation, currentUserId), created: true };
  }

  async get(currentUserId: string, conversationId: string) {
    await this.assertParticipant(currentUserId, conversationId);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: PARTICIPANT_SELECT } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: PARTICIPANT_SELECT },
        },
        _count: {
          select: {
            messages: {
              where: { readAt: null, deletedAt: null, senderId: { not: currentUserId } },
            },
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.toSummary(conversation, currentUserId);
  }

  async assertParticipant(currentUserId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: currentUserId },
      },
    });
    if (!participant) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }
    return participant;
  }

  private serializeMessage(message: any) {
    const reactions: Record<string, { count: number; userIds: string[] }> = {};
    for (const r of message.reactions ?? []) {
      if (!reactions[r.emoji]) reactions[r.emoji] = { count: 0, userIds: [] };
      reactions[r.emoji].count += 1;
      reactions[r.emoji].userIds.push(r.userId);
    }
    return {
      ...message,
      content: message.deletedAt ? '' : message.content,
      deleted: Boolean(message.deletedAt),
      edited: Boolean(message.editedAt),
      pinned: Boolean(message.pinnedAt),
      reactions,
      replyTo: message.replyTo
        ? {
            ...message.replyTo,
            content: message.replyTo.deletedAt ? '' : message.replyTo.content,
          }
        : null,
    };
  }

  async listMessages(
    currentUserId: string,
    conversationId: string,
    take = 50,
    skip = 0,
    q?: string,
  ) {
    await this.assertParticipant(currentUserId, conversationId);
    const query = q?.trim();
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(query
          ? { content: { contains: query, mode: 'insensitive' }, deletedAt: null }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(take, 100),
      skip,
      include: MESSAGE_INCLUDE,
    });
    return { messages: messages.map((m) => this.serializeMessage(m)) };
  }

  private sanitizeAttachments(attachments?: MessageAttachmentDto[]) {
    if (!attachments?.length) return [];
    return attachments.map((a) => {
      if (!a.url.startsWith('/uploads/') || a.url.includes('..')) {
        throw new BadRequestException('Invalid attachment URL');
      }
      const type: AttachmentType =
        a.type === 'IMAGE' || (a.type == null && a.mimeType.startsWith('image/'))
          ? 'IMAGE'
          : 'DOCUMENT';
      return { url: a.url, name: a.name, mimeType: a.mimeType, size: a.size, type };
    });
  }

  async sendMessage(
    currentUserId: string,
    conversationId: string,
    contentOrDto: string | SendMessageDto,
    extra: Partial<SendMessageDto> = {},
  ) {
    await this.assertParticipant(currentUserId, conversationId);

    const dto: SendMessageDto =
      typeof contentOrDto === 'string'
        ? { ...extra, content: contentOrDto }
        : contentOrDto;

    const content = (dto.content ?? '').trim();
    const attachments = this.sanitizeAttachments(dto.attachments);
    if (!content && attachments.length === 0) {
      throw new BadRequestException('Write a message or attach a file');
    }

    if (dto.replyToId) {
      const replyTo = await this.prisma.message.findUnique({
        where: { id: dto.replyToId },
        select: { conversationId: true },
      });
      if (!replyTo || replyTo.conversationId !== conversationId) {
        throw new BadRequestException('The message you are replying to does not exist');
      }
    }

    // Blocked users cannot exchange messages.
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: currentUserId } },
      select: { userId: true },
    });
    for (const p of participants) {
      await this.assertNotBlocked(currentUserId, p.userId);
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: currentUserId,
        content,
        replyToId: dto.replyToId ?? null,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: MESSAGE_INCLUDE,
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // A new message restores the thread in the recipients' inboxes.
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: { not: currentUserId } },
      data: { deletedAt: null, archivedAt: null },
    });

    await Promise.all(
      participants.map((p) =>
        this.notifications.create(p.userId, {
          type: 'MESSAGE',
          actorId: currentUserId,
          entityId: conversationId,
          message: `sent you a message: ${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`,
          dedupe: false,
        }),
      ),
    );

    return this.serializeMessage(message);
  }

  async markRead(currentUserId: string, conversationId: string) {
    await this.assertParticipant(currentUserId, conversationId);
    const now = new Date();
    await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: currentUserId }, readAt: null },
      data: { readAt: now },
    });
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: currentUserId } },
      data: { lastReadAt: now },
    });
    return { success: true, readAt: now };
  }

  private async assertOwnMessage(currentUserId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true, deletedAt: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== currentUserId) {
      throw new ForbiddenException('You can only change your own messages');
    }
    await this.assertParticipant(currentUserId, message.conversationId);
    return message;
  }

  async editMessage(currentUserId: string, messageId: string, content: string) {
    const message = await this.assertOwnMessage(currentUserId, messageId);
    if (message.deletedAt) throw new BadRequestException('This message was deleted');
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    return this.serializeMessage(updated);
  }

  async deleteMessage(currentUserId: string, messageId: string) {
    const message = await this.assertOwnMessage(currentUserId, messageId);
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: '' },
      include: MESSAGE_INCLUDE,
    });
    return this.serializeMessage(updated);
  }

  async pinMessage(currentUserId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, deletedAt: true, pinnedAt: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.deletedAt) throw new BadRequestException('This message was deleted');
    await this.assertParticipant(currentUserId, message.conversationId);

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: message.pinnedAt ? null : new Date() },
      include: MESSAGE_INCLUDE,
    });
    return this.serializeMessage(updated);
  }

  async reactMessage(currentUserId: string, messageId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, senderId: true, deletedAt: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.deletedAt) throw new BadRequestException('This message was deleted');
    await this.assertParticipant(currentUserId, message.conversationId);

    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId: currentUserId } },
    });

    if (existing && existing.emoji === emoji) {
      await this.prisma.messageReaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.messageReaction.update({
        where: { id: existing.id },
        data: { emoji },
      });
    } else {
      await this.prisma.messageReaction.create({
        data: { messageId, userId: currentUserId, emoji },
      });
    }

    const updated = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    return this.serializeMessage(updated);
  }

  async updateFlags(
    currentUserId: string,
    conversationId: string,
    flags: { archived?: boolean; muted?: boolean },
  ) {
    await this.assertParticipant(currentUserId, conversationId);
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: currentUserId } },
      data: {
        ...(flags.archived !== undefined
          ? { archivedAt: flags.archived ? new Date() : null }
          : {}),
        ...(flags.muted !== undefined ? { muted: flags.muted } : {}),
      },
    });
    return this.get(currentUserId, conversationId);
  }

  /**
   * "Delete conversation" removes it from the current user's inbox only.
   * The other participant keeps their copy, and a future message restores it.
   */
  async deleteConversation(currentUserId: string, conversationId: string) {
    await this.assertParticipant(currentUserId, conversationId);
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: currentUserId } },
      data: { deletedAt: new Date(), archivedAt: null },
    });
    return { success: true };
  }

  async conversationIdsForUser(userId: string) {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { userId, deletedAt: null },
      select: { conversationId: true },
    });
    return rows.map((r) => r.conversationId);
  }

  async participantIds(conversationId: string) {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async conversationIdForMessage(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    return message?.conversationId ?? null;
  }
}
