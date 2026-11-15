'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { UserCard } from '@/components/users/UserCard';
import { PostCard } from '@/components/feed/PostCard';
import { postsService, usersService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { Post, User } from '@/types';

export function SearchClient({ initialQuery, initialTab }: { initialQuery: string; initialTab: 'people' | 'posts' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<'people' | 'posts'>(initialTab);
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async (q: string, activeTab: 'people' | 'posts') => {
    setLoading(true);
    setSearched(true);
    try {
      if (activeTab === 'people') {
        const res = await usersService.search(q);
        setUsers(res.users);
      } else {
        const res = await postsService.search(q);
        setPosts(res.posts);
      }
    } catch {
      // no-op
    } finally {
      setLoading(false);
    }
  }, []);

  // React to URL changes (e.g. when using a link with ?q=).
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    const t = (searchParams.get('tab') as 'people' | 'posts') || 'people';
    setQuery(q);
    setTab(t);
    if (q) void runSearch(q, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    params.set('tab', tab);
    router.push(`/search?${params.toString()}`);
  }

  function switchTab(next: 'people' | 'posts') {
    setTab(next);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    params.set('tab', next);
    router.push(`/search?${params.toString()}`);
  }

  const hasResults = tab === 'people' ? users.length > 0 : posts.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          name="q"
          placeholder={tab === 'people' ? 'Search people by name, skill or headline…' : 'Search posts…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit">Search</Button>
      </form>

      <div className="flex gap-1 border-b border-border">
        {(['people', 'posts'] as const).map((value) => (
          <button
            key={value}
            onClick={() => switchTab(value)}
            className={cn(
              'border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors',
              tab === value
                ? 'border-accent text-foreground'
                : 'border-transparent text-subtle hover:text-foreground',
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : !searched ? (
        <EmptyState
          title="Search QUITIN"
          description="Find developers, students and recruiters, or look through posts."
        />
      ) : !hasResults ? (
        <EmptyState title="No results" description={`Nothing matched "${query}".`} />
      ) : tab === 'people' ? (
        <div className="space-y-2">
          {users.map((u) => (
            <UserCard key={u.id} user={u} currentUsername={user?.username} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
