'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { usersService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';

export function FollowButton({
  username,
  initialFollowing,
  initialRequested = false,
  size = 'sm',
  followLabel = 'Follow',
  followingLabel = 'Following',
  onChange,
}: {
  username: string;
  initialFollowing: boolean;
  initialRequested?: boolean;
  size?: 'sm' | 'md';
  followLabel?: string;
  followingLabel?: string;
  onChange?: (state: { following: boolean; requested: boolean }) => void;
}) {
  const toast = useToast();
  const { refresh } = useAuth();
  const [following, setFollowing] = useState(initialFollowing);
  const [requested, setRequested] = useState(initialRequested);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFollowing(initialFollowing);
    setRequested(initialRequested);
  }, [initialFollowing, initialRequested]);

  async function toggle() {
    setLoading(true);
    try {
      const res = await usersService.follow(username);
      setFollowing(res.following);
      setRequested(res.requested);
      onChange?.({ following: res.following, requested: res.requested });
      await refresh();
      if (res.requested) toast.info('Follow request sent');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update follow');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={following ? 'secondary' : requested ? 'secondary' : 'primary'}
      size={size}
      loading={loading}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
    >
      {following ? followingLabel : requested ? 'Requested' : followLabel}
    </Button>
  );
}
