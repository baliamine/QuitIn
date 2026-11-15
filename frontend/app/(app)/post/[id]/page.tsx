'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PostCard } from '@/components/feed/PostCard';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { FollowButton } from '@/components/users/FollowButton';
import { postsService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import type { Post } from '@/types';

export default function PostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPost(await postsService.get(params.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This post is not available');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-muted hover:text-foreground"
        >
          ← Back
        </button>
        <EmptyState
          title="Post not available"
          description={error ?? 'It may have been deleted, or you may not have permission to view it.'}
          icon={<span className="text-2xl">🔒</span>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-muted hover:text-foreground"
        >
          ← Back
        </button>
        <PostCard
          post={post}
          defaultCommentsOpen
          onDeleted={() => router.push('/feed')}
          onUpdated={(updated) => setPost(updated)}
        />
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <Card className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">
              About the author
            </p>
            <Link href={`/profile/${post.author.username}`} className="flex items-center gap-3">
              <Avatar src={post.author.profile?.avatarUrl} name={post.author.username} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  @{post.author.username}
                </p>
                <p className="truncate text-xs text-subtle">
                  {post.author.profile?.headline || 'QUITIN member'}
                </p>
              </div>
            </Link>
            {user?.id !== post.author.id && (
              <div className="mt-4 flex gap-2">
                <FollowButton
                  username={post.author.username}
                  initialFollowing={false}
                  size="sm"
                />
                <Link
                  href={`/messages?to=${encodeURIComponent(post.author.username)}`}
                  className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-elevated"
                >
                  Message
                </Link>
              </div>
            )}
          </Card>
        </div>
      </aside>
    </div>
  );
}
