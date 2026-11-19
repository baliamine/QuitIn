'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { FollowButton } from './FollowButton';
import type { User } from '@/types';

export function UserCard({
  user,
  showFollow = true,
  currentUsername,
  followLabel,
  followingLabel,
}: {
  user: User;
  showFollow?: boolean;
  currentUsername?: string;
  followLabel?: string;
  followingLabel?: string;
}) {
  const name = user.profile?.headline || user.username;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-strong">
      <Link href={`/profile/${user.username}`} className="shrink-0">
        <Avatar src={user.profile?.avatarUrl} name={name} size="md" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/profile/${user.username}`} className="block">
          <p className="truncate text-sm font-semibold text-foreground hover:underline">@{user.username}</p>
          {user.profile?.headline && (
            <p className="truncate text-xs text-muted">{user.profile.headline}</p>
          )}
          {user.profile?.location && (
            <p className="truncate text-xs text-subtle">{user.profile.location}</p>
          )}
        </Link>
      </div>
      {showFollow && user.username !== currentUsername && (
        <FollowButton
          username={user.username}
          initialFollowing={!!user.isFollowing}
          initialRequested={!!user.isRequested}
          followLabel={followLabel}
          followingLabel={followingLabel}
        />
      )}
    </div>
  );
}
