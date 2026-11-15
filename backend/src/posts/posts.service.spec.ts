import { PostsService } from './posts.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PostsService', () => {
  let service: PostsService;
  let prisma: any;
  let notifications: any;
  let conversations: any;
  let config: any;

  beforeEach(() => {
    prisma = {
      post: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
      like: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      comment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      block: { findMany: jest.fn().mockResolvedValue([]) },
      follow: { findUnique: jest.fn().mockResolvedValue(null) },
      hiddenPost: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    conversations = {
      findOrCreate: jest.fn(),
      assertParticipant: jest.fn(),
      sendMessage: jest.fn(),
    };
    config = { get: jest.fn((_key: string, fallback?: unknown) => fallback) };
    service = new PostsService(prisma, notifications, conversations, config);
  });

  describe('react', () => {
    it('creates a reaction and notifies the author when none exists', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', authorId: 'author1' });
      prisma.like.findUnique.mockResolvedValue(null);
      prisma.like.create.mockResolvedValue({ id: 'l1' });
      prisma.like.groupBy.mockResolvedValue([{ type: 'LIKE', _count: { _all: 1 } }]);

      const result = await service.react('user1', 'p1', { type: 'LIKE' });

      expect(result).toEqual({
        reactions: { LIKE: 1 },
        reactionCount: 1,
        myReaction: 'LIKE',
      });
      expect(prisma.like.create).toHaveBeenCalledWith({
        data: { postId: 'p1', userId: 'user1', type: 'LIKE' },
      });
      expect(notifications.create).toHaveBeenCalledWith(
        'author1',
        expect.objectContaining({ type: 'LIKE', actorId: 'user1' }),
      );
    });

    it('removes the reaction when the same type is selected again', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', authorId: 'author1' });
      prisma.like.findUnique.mockResolvedValue({ id: 'l1', type: 'LIKE' });

      const result = await service.react('user1', 'p1', { type: 'LIKE' });

      expect(result.myReaction).toBeNull();
      expect(prisma.like.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('throws when the post does not exist', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.react('user1', 'missing', { type: 'LIKE' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it("forbids deleting another user's post", async () => {
      prisma.post.findUnique.mockResolvedValue({ authorId: 'someone-else' });
      await expect(service.remove('user1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.post.delete).not.toHaveBeenCalled();
    });

    it('deletes the post when the user owns it', async () => {
      prisma.post.findUnique.mockResolvedValue({ authorId: 'user1' });
      prisma.post.delete.mockResolvedValue({ id: 'p1' });
      const result = await service.remove('user1', 'p1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('feed', () => {
    it('exposes the current user reaction and counts', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'p1',
          likes: [{ userId: 'user1', type: 'LIKE' }],
          _count: { likes: 1, comments: 0 },
          author: {},
          attachments: [],
          repostOf: null,
        },
      ]);
      const result = await service.feed('user1');
      expect(result.posts[0].myReaction).toBe('LIKE');
      expect(result.posts[0].reactionCount).toBe(1);
    });
  });
});
