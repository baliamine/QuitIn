'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { notificationsService } from '@/lib/services';
import { getSocket } from '@/lib/socket';
import { cn, timeAgo } from '@/lib/utils';
import type { Notification } from '@/types';

const ICONS: Record<Notification['type'], string> = {
  LIKE: '♥',
  COMMENT: '💬',
  FOLLOW: '＋',
  MESSAGE: '✉',
  WELCOME: '★',
  REPOST: '🔁',
  FOLLOW_REQUEST: '🙋',
  FOLLOW_ACCEPTED: '✓',
  CALL: '📞',
  MEETING: '🗓',
  JOB_APPLICATION: '💼',
  JOB_APPLICATION_UPDATE: '📩',
  JOB_APPLICATION_ACCEPTED: '🎉',
  JOB_APPLICATION_REJECTED: '🚫',
  INTERVIEW_INVITATION: '🗓',
  JOB_OFFER: '📨',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setNotifications(await notificationsService.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onNew = () => void load();
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [load]);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await notificationsService.markRead(id).catch(() => undefined);
  }

  async function markAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await notificationsService.markAllRead().catch(() => undefined);
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Notifications</h1>
        {hasUnread && (
          <Button size="sm" variant="secondary" onClick={() => void markAll()}>
            Mark all as read
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="When someone follows you, likes or comments on your posts, you'll see it here."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            // Deep links: messages/notifications about people go to the dedicated
            // messages page; likes/comments/reposts go to the post itself.
            let href = '/feed';
            if (notification.actor) {
              if (
                notification.type === 'MESSAGE' ||
                notification.type === 'FOLLOW_REQUEST' ||
                notification.type === 'CALL' ||
                notification.type === 'MEETING'
              ) {
                href = `/messages?to=${encodeURIComponent(notification.actor.username)}`;
              } else if (notification.type === 'FOLLOW') {
                href = `/profile/${notification.actor.username}`;
              }
            }
            if (
              (notification.type === 'LIKE' ||
                notification.type === 'COMMENT' ||
                notification.type === 'REPOST') &&
              notification.entityId
            ) {
              href = `/post/${notification.entityId}`;
            }
            if (
              (notification.type === 'JOB_APPLICATION' ||
                notification.type === 'JOB_APPLICATION_UPDATE' ||
                notification.type === 'JOB_APPLICATION_ACCEPTED' ||
                notification.type === 'JOB_APPLICATION_REJECTED' ||
                notification.type === 'INTERVIEW_INVITATION' ||
                notification.type === 'JOB_OFFER') &&
              notification.entityId
            ) {
              href = `/jobs/${notification.entityId}`;
            }
            return (
              <Link
                key={notification.id}
                href={href}
                onClick={() => void markRead(notification.id)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 transition-colors',
                  notification.read
                    ? 'border-border bg-surface hover:border-strong'
                    : 'border-accent/40 bg-accent/5 hover:border-accent/60',
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated text-sm">
                  <span aria-hidden>{ICONS[notification.type]}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {notification.actor && (
                      <Avatar
                        src={notification.actor.profile?.avatarUrl}
                        name={notification.actor.profile?.headline || notification.actor.username}
                        size="sm"
                      />
                    )}
                    <p className="text-sm text-foreground">
                      {notification.actor && (
                        <span className="font-semibold text-foreground">@{notification.actor.username} </span>
                      )}
                      {notification.message}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-subtle">{timeAgo(notification.createdAt)}</p>
                </div>
                {!notification.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
