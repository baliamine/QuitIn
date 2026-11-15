'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Markdown } from '@/components/ui/Markdown';
import { aiService } from '@/lib/services';
import { absoluteUrl, cn, timeAgo } from '@/lib/utils';
import type { SharedAiConversation } from '@/types';

export function SharedAiClient({ token }: { token: string }) {
  const [conversation, setConversation] = useState<SharedAiConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await aiService.getShared(token);
        if (!cancelled) setConversation(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Shared chat is not available');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <EmptyState
          title="This shared chat is unavailable"
          description={error ?? 'The link may be invalid or the owner turned sharing off.'}
          icon={<span className="text-2xl">🔐</span>}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Shared AI conversation</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{conversation.title}</h1>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 text-center">
          <Avatar
            src={conversation.author.profile?.avatarUrl}
            name={conversation.author.username}
            size="xl"
          />
          <p className="mt-3 text-lg font-semibold text-foreground">
            @{conversation.author.username}
          </p>
          <p className="text-sm text-muted">
            shared an AI conversation about technology and careers
          </p>
        </div>

        <div className="space-y-4">
          {conversation.messages.map((message, index) => {
            const mine = message.role === 'user';
            const previous = conversation.messages[index - 1];
            const showDay =
              !previous ||
              new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
            const gap =
              !previous ||
              new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() >
                30 * 60 * 1000;
            return (
              <div key={message.id}>
                {showDay && (
                  <div className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                      {new Date(message.createdAt).toLocaleDateString()}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                {gap && (
                  <div className="text-center">
                    <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] text-subtle">
                      {timeAgo(message.createdAt)}
                    </span>
                  </div>
                )}
                <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5',
                      mine ? 'bg-accent text-white' : 'bg-surface text-foreground ring-1 ring-border',
                    )}
                  >
                    {mine ? (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {message.content}
                      </p>
                    ) : (
                      <Markdown content={message.content} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-subtle">
          Powered by{' '}
          <a href={absoluteUrl('/assistant')} className="font-medium text-accent hover:underline">
            the QUITIN AI assistant
          </a>
        </p>
      </div>
    </div>
  );
}
