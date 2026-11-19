import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentType, PostVisibility, Prisma, ReactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationsService } from '../conversations/conversations.service';
import {
  AttachmentDto,
  CreateCommentDto,
  CreatePostDto,
  ReactDto,
  ReportDto,
  RepostDto,
  SharePostDto,
  UpdatePostDto,
} from './dto/post.dto';

const AUTHOR_SELECT = {
  select: {
    id: true,
    username: true,
    lastActiveAt: true,
    profile: { select: { avatarUrl: true, headline: true, visibility: true } },
  },
} satisfies Prisma.UserArgs;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly conversations: ConversationsService,
    private readonly config: ConfigService,
  ) {}

  private postInclude(): Prisma.PostInclude {
    return {
      author: AUTHOR_SELECT,
      attachments: { orderBy: { createdAt: 'asc' } },
      likes: { select: { userId: true, type: true } },
      _count: { select: { likes: true, comments: true } },
      repostOf: {
        include: {
          author: AUTHOR_SELECT,
          attachments: { orderBy: { createdAt: 'asc' } },
          _count: { select: { likes: true, comments: true } },
        },
      },
    };
  }

  private serialize(post: any, currentUserId: string) {
    const reactions: Record<string, number> = {};
    for (const like of post.likes ?? []) {
      reactions[like.type] = (reactions[like.type] ?? 0) + 1;
    }
    const myReaction =
      (post.likes ?? []).find((l: any) => l.userId === currentUserId)?.type ?? null;

    const { likes, ...rest } = post;
    return {
      ...rest,
      reactions,
      reactionCount: post._count?.likes ?? 0,
      myReaction,
    };
  }

  private sanitizeAttachments(attachments?: AttachmentDto[]) {
    if (!attachments?.length) return [];
    return attachments.map((a) => {
      if (!a.url.startsWith('/uploads/') || a.url.includes('..')) {
        throw new BadRequestException('Invalid attachment URL');
      }
      const inferred: AttachmentType =
        a.type === 'IMAGE' || (a.type == null && a.mimeType.startsWith('image/'))
          ? 'IMAGE'
          : 'DOCUMENT';
      return {
        url: a.url,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        type: inferred,
        caption: a.caption ?? null,
      };
    });
  }

  private async blockedIds(userId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
  }

  private async assertCanInteract(userId: string, otherId: string) {
    if (userId === otherId) return;
    if ((await this.blockedIds(userId)).includes(otherId)) {
      throw new ForbiddenException('You can no longer interact with this user');
    }
  }

  /**
   * Posts visible to `userId`: their own posts, public posts from public
   * profiles, and posts from people they follow (which covers private profiles
   * and followers-only posts). Hidden posts and blocked users are excluded.
   */
  private async visibilityWhere(userId: string): Promise<Prisma.PostWhereInput> {
    const blocked = await this.blockedIds(userId);
    return {
      AND: [
        { hiddenBy: { none: { userId } } },
        blocked.length ? { authorId: { notIn: blocked } } : {},
        {
          OR: [
            { authorId: userId },
            { visibility: 'PUBLIC', author: { profile: { is: { visibility: 'PUBLIC' } } } },
            { visibility: 'PUBLIC', author: { profile: null } },
            { author: { followers: { some: { followerId: userId } } } },
          ],
        },
      ],
    };
  }

  private async assertCanView(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { author: { select: { id: true, profile: { select: { visibility: true } } } } },
    });
    if (!post) throw new NotFoundException('Post not found');

    const blocked = await this.blockedIds(userId);
    if (blocked.includes(post.authorId)) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId === userId) return post;

    const follows = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: userId, followingId: post.authorId },
      },
    });

    const authorPrivate = post.author.profile?.visibility === 'PRIVATE';
    const followersOnly = post.visibility === 'FOLLOWERS';
    if ((authorPrivate || followersOnly) && !follows) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  async createFeedPost(authorId: string, dto: CreatePostDto) {
    const content = (dto.content ?? '').trim();
    const attachments = this.sanitizeAttachments(dto.attachments);

    if (!content && !dto.imageUrl && attachments.length === 0) {
      throw new BadRequestException('Add some text or an attachment to publish a post');
    }

    const post = await this.prisma.post.create({
      data: {
        authorId,
        content,
        imageUrl: dto.imageUrl,
        visibility: dto.visibility ?? PostVisibility.PUBLIC,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: this.postInclude(),
    });
    return this.serialize(post, authorId);
  }

  async feed(currentUserId: string, authorUsername?: string, take = 20, skip = 0) {
    const base = await this.visibilityWhere(currentUserId);
    const where: Prisma.PostWhereInput = authorUsername
      ? {
          AND: [
            base,
            { author: { username: authorUsername.toLowerCase() } },
          ],
        }
      : base;

    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 50),
      skip,
      include: this.postInclude(),
    });

    return { posts: posts.map((p) => this.serialize(p, currentUserId)) };
  }

  async getById(id: string, currentUserId: string) {
    await this.assertCanView(id, currentUserId);
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: this.postInclude(),
    });
    if (!post) throw new NotFoundException('Post not found');
    return this.serialize(post, currentUserId);
  }

  async update(userId: string, id: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { authorId: true, content: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    const attachments = dto.attachments ? this.sanitizeAttachments(dto.attachments) : undefined;
    const content = dto.content !== undefined ? dto.content.trim() : undefined;
    if (content !== undefined && !content && !attachments?.length) {
      throw new BadRequestException('A post cannot be empty');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (attachments) {
        await tx.postAttachment.deleteMany({ where: { postId: id } });
      }
      return tx.post.update({
        where: { id },
        data: {
          ...(content !== undefined ? { content } : {}),
          ...(dto.visibility ? { visibility: dto.visibility } : {}),
          editedAt: new Date(),
          ...(attachments
            ? { attachments: attachments.length ? { create: attachments } : undefined }
            : {}),
        },
        include: this.postInclude(),
      });
    });

    return this.serialize(updated, userId);
  }

  async remove(userId: string, id: string) {
    const post = await this.prisma.post.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }
    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  async react(userId: string, postId: string, dto: ReactDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertCanInteract(userId, post.authorId);

    const existing = await this.prisma.like.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    let myReaction: ReactionType | null = dto.type;

    if (existing && existing.type === dto.type) {
      await this.prisma.like.delete({ where: { id: existing.id } });
      myReaction = null;
    } else if (existing) {
      await this.prisma.like.update({ where: { id: existing.id }, data: { type: dto.type } });
    } else {
      await this.prisma.like.create({ data: { postId, userId, type: dto.type } });
      await this.notifications.create(post.authorId, {
        type: 'LIKE',
        actorId: userId,
        entityId: postId,
        message: `reacted to your post`,
      });
    }

    const grouped = await this.prisma.like.groupBy({
      by: ['type'],
      where: { postId },
      _count: { _all: true },
    });
    const reactions: Record<string, number> = {};
    grouped.forEach((g) => {
      reactions[g.type] = g._count._all;
    });
    const total = grouped.reduce((sum, g) => sum + g._count._all, 0);

    return { reactions, reactionCount: total, myReaction };
  }

  async reactors(postId: string) {
    const rows = await this.prisma.like.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
      include: { user: AUTHOR_SELECT },
    });
    return {
      reactors: rows.map((r) => ({ type: r.type, user: r.user, createdAt: r.createdAt })),
    };
  }

  async repost(userId: string, postId: string, dto: RepostDto) {
    await this.assertCanView(postId, userId);
    const original = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, repostOfId: true },
    });
    if (!original) throw new NotFoundException('Post not found');

    // Repost the root post, not another repost.
    const rootId = original.repostOfId ?? original.id;

    const existing = await this.prisma.post.findFirst({
      where: { authorId: userId, repostOfId: rootId },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('You have already reposted this post');
    }

    const created = await this.prisma.post.create({
      data: {
        authorId: userId,
        content: (dto.content ?? '').trim(),
        repostOfId: rootId,
      },
      include: this.postInclude(),
    });

    await this.notifications.create(original.authorId, {
      type: 'REPOST',
      actorId: userId,
      entityId: rootId,
      message: 'reposted your post',
    });

    return this.serialize(created, userId);
  }

  async hide(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.hiddenPost.upsert({
      where: { userId_postId: { userId, postId } },
      update: {},
      create: { userId, postId },
    });
    return { hidden: true };
  }

  async unhide(userId: string, postId: string) {
    await this.prisma.hiddenPost.deleteMany({ where: { userId, postId } });
    return { hidden: false };
  }

  async report(userId: string, postId: string, dto: ReportDto) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: 'POST',
        targetId: postId,
        reason: dto.reason,
        details: dto.details,
      },
    });
    return { success: true };
  }

  async share(userId: string, postId: string, dto: SharePostDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, content: true, author: { select: { username: true } } },
    });
    if (!post) throw new NotFoundException('Post not found');

    let conversationId = dto.conversationId;
    if (!conversationId) {
      if (!dto.username) {
        throw new BadRequestException('Choose a conversation or a username');
      }
      const { conversation } = await this.conversations.findOrCreate(userId, {
        username: dto.username,
      });
      conversationId = conversation.id;
    } else {
      await this.conversations.assertParticipant(userId, conversationId);
    }

    if (!conversationId) {
      throw new BadRequestException('Could not open a conversation');
    }
    const targetConversationId: string = conversationId;

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const url = `${frontendUrl}/post/${post.id}`;
    const preview = post.content.length > 140 ? `${post.content.slice(0, 140)}…` : post.content;
    const body = [
      dto.message?.trim() || 'Check out this post',
      '',
      `“${preview}” — @${post.author.username}`,
      url,
    ].join('\n');

    const message = await this.conversations.sendMessage(userId, targetConversationId, body);
    return { conversationId: targetConversationId, message };
  }

  async addComment(userId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertCanInteract(userId, post.authorId);

    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { postId: true },
      });
      if (!parent || parent.postId !== postId) {
        throw new BadRequestException('The comment you are replying to does not exist');
      }
    }

    const comment = await this.prisma.comment.create({
      data: {
        postId,
        authorId: userId,
        parentId: dto.parentId ?? null,
        content: dto.content.trim(),
      },
      include: {
        author: AUTHOR_SELECT,
        likes: { select: { userId: true } },
        _count: { select: { likes: true } },
      },
    });

    await this.notifications.create(post.authorId, {
      type: 'COMMENT',
      actorId: userId,
      entityId: postId,
      message: dto.parentId ? 'replied to a comment on your post' : 'commented on your post',
    });

    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { authorId: true },
      });
      if (parent) {
        await this.notifications.create(parent.authorId, {
          type: 'COMMENT',
          actorId: userId,
          entityId: postId,
          message: 'replied to your comment',
        });
      }
    }

    return {
      ...comment,
      likedByMe: false,
      likeCount: 0,
      replies: [],
    };
  }

  async listComments(postId: string, currentUserId: string, take = 100, skip = 0) {
    const comments = await this.prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(take, 200),
      skip,
      include: {
        author: AUTHOR_SELECT,
        likes: { select: { userId: true } },
        _count: { select: { likes: true } },
      },
    });

    return comments.map((c) => ({
      ...c,
      likedByMe: c.likes.some((l) => l.userId === currentUserId),
      likeCount: c._count.likes,
      likes: undefined,
      _count: undefined,
    }));
  }

  async toggleCommentLike(userId: string, postId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, authorId: true },
    });
    if (!comment || comment.postId !== postId) {
      throw new NotFoundException('Comment not found');
    }
    await this.assertCanInteract(userId, comment.authorId);

    const existing = await this.prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      await this.prisma.commentLike.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.commentLike.create({ data: { commentId, userId } });
      await this.notifications.create(comment.authorId, {
        type: 'LIKE',
        actorId: userId,
        entityId: postId,
        message: 'liked your comment',
      });
    }

    const count = await this.prisma.commentLike.count({ where: { commentId } });
    return { liked: !existing, likeCount: count };
  }

  async deleteComment(userId: string, postId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, postId: true, post: { select: { authorId: true } } },
    });
    if (!comment || comment.postId !== postId) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.authorId !== userId && comment.post.authorId !== userId) {
      throw new ForbiddenException('You cannot delete this comment');
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { success: true };
  }

  async searchPosts(currentUserId: string, q: string | undefined, take = 20, skip = 0) {
    const query = (q ?? '').trim();
    const base = await this.visibilityWhere(currentUserId);
    const where: Prisma.PostWhereInput = query
      ? { AND: [base, { content: { contains: query, mode: 'insensitive' } }] }
      : base;

    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 50),
      skip,
      include: this.postInclude(),
    });
    return { posts: posts.map((p) => this.serialize(p, currentUserId)) };
  }
}
