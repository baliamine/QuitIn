'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CreatePost } from '@/components/feed/CreatePost';
import { PostCard } from '@/components/feed/PostCard';
import { UserCard } from '@/components/users/UserCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { postsService, usersService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { Post, User } from '@/types';

const PAGE_SIZE = 10;

export default function FeedPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextTab: 'all' | 'mine' = 'all') => {
      setLoading(true);
      setError(null);
      try {
        const [feed, suggested] = await Promise.all([
          postsService.feed({
            take: PAGE_SIZE,
            username: nextTab === 'mine' ? user?.username : undefined,
          }),
          usersService.suggestions(),
        ]);
        setPosts(feed.posts);
        setHasMore(feed.posts.length === PAGE_SIZE);
        setSuggestions(suggested.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your feed');
      } finally {
        setLoading(false);
      }
    },
    [user?.username],
  );

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const feed = await postsService.feed({
        take: PAGE_SIZE,
        skip: posts.length,
        username: tab === 'mine' ? user?.username : undefined,
      });
      setPosts((current) => [...current, ...feed.posts]);
      setHasMore(feed.posts.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Home</h1>
            <p className="text-sm text-muted">Updates from your network</p>
          </div>
          <div className="flex rounded-lg border border-border bg-surface p-1">
            {(
              [
                ['all', 'For you'],
                ['mine', 'Your posts'],
              ] as ['all' | 'mine', string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === value
                    ? 'bg-elevated text-foreground'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <CreatePost
          onCreated={(post) => {
            setPosts((prev) => [post, ...prev]);
            if (tab === 'mine') setTab('mine');
          }}
        />

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <EmptyState
            title="Could not load your feed"
            description={error}
            icon={<span className="text-2xl">⚠️</span>}
          />
        ) : posts.length === 0 ? (
          <EmptyState
            title={tab === 'mine' ? 'You have not posted yet' : 'Your feed is empty'}
            description={
              tab === 'mine'
                ? 'Share your first update using the box above.'
                : 'Follow other people or write your first post to get started.'
            }
            icon={<span className="text-2xl">📰</span>}
          />
        ) : (
          <>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
                onUpdated={(updated) =>
                  setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                }
              />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                  Load more posts
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          {user && (
            <Card className="p-4">
              <Link href={`/profile/${user.username}`} className="flex items-center gap-3">
                <Avatar src={user.profile?.avatarUrl} name={user.username} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    @{user.username}
                  </p>
                  <p className="truncate text-xs text-subtle">
                    {user.profile?.headline || 'Add a headline'}
                  </p>
                </div>
              </Link>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                <div>
                  <p className="text-sm font-semibold text-foreground">{user._count?.posts ?? 0}</p>
                  <p className="text-[11px] text-subtle">Posts</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {user._count?.followers ?? 0}
                  </p>
                  <p className="text-[11px] text-subtle">Followers</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {user._count?.following ?? 0}
                  </p>
                  <p className="text-[11px] text-subtle">Following</p>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <CardHeader title="People to follow" />
            <div className="space-y-2">
              {suggestions.length === 0 ? (
                <p className="text-sm text-subtle">No suggestions right now.</p>
              ) : (
                suggestions.map((suggestion) => (
                  <UserCard
                    key={suggestion.id}
                    user={suggestion}
                    currentUsername={user?.username}
                  />
                ))
              )}
            </div>
          </Card>

          <Card className="p-4">
            <CardHeader title="Shortcuts" />
            <div className="space-y-1 text-sm">
              <Link
                href="/assistant"
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                ✨ Ask the QUITIN assistant
              </Link>
              <Link
                href="/messages"
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                💬 Open messages
              </Link>
              <Link
                href="/settings?tab=privacy"
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                🔒 Privacy controls
              </Link>
            </div>
          </Card>
        </div>
      </aside>
    </div>
  );
}
