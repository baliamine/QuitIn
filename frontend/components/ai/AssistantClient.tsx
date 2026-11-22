'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  ActionMenu,
  CopyIcon,
  PencilIcon,
  RefreshIcon,
  ShareIcon,
  TrashIcon,
} from '@/components/ui/ActionMenu';
import { Spinner } from '@/components/ui/Feedback';
import { Markdown } from '@/components/ui/Markdown';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { aiService, uploadService } from '@/lib/services';
import { absoluteUrl, cn, formatBytes, timeAgo } from '@/lib/utils';
import type { AiConversation, AiMessage, Attachment } from '@/types';

const SUGGESTIONS = [
  'Explain database indexing like I am preparing for an interview',
  'Review this approach: a rate limiter using a Redis sorted set',
  'How do I prepare for a system design interview in 2 weeks?',
  'Write a TypeScript helper that debounces an async function',
];

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) =>
        attachment.type === 'IMAGE' ? (
          <a
            key={attachment.id ?? attachment.url}
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.url}
              alt={attachment.name}
              className="h-28 w-28 object-cover"
            />
          </a>
        ) : (
          <a
            key={attachment.id ?? attachment.url}
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs hover:bg-elevated"
          >
            <span aria-hidden>📄</span>
            <span className="max-w-[180px] truncate">{attachment.name}</span>
            <span className="text-subtle">{formatBytes(attachment.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function AssistantClient() {
  const toast = useToast();
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AiConversation | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AiConversation | null>(null);
  const [shareTarget, setShareTarget] = useState<AiConversation | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [shareBusy, setShareBusy] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const loadConversations = useCallback(async (q?: string) => {
    const list = await aiService.listConversations(q);
    setConversations(list);
    return list;
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    setError(null);
    setCanRetry(false);
    setLoadingThread(true);
    try {
      const conversation = await aiService.getConversation(id);
      setMessages(conversation.messages);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open conversation');
    } finally {
      setLoadingThread(false);
    }
  }, [toast]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await loadConversations();
        if (list[0]) await openConversation(list[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your conversations.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadConversations(searchQuery.trim() || undefined).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchQuery, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, regenerating]);

  async function newConversation() {
    try {
      const conversation = await aiService.createConversation();
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
      setMessages([]);
      setError(null);
      setSidebarOpen(false);
      setText('');
      setAttachments([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create conversation');
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files).slice(0, 3)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 20 MB`);
          continue;
        }
        uploaded.push(await uploadService.file(file));
      }
      setAttachments((prev) => [...prev, ...uploaded].slice(0, 3));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function refresh(id: string) {
    try {
      const conversation = await aiService.getConversation(id);
      setMessages(conversation.messages);
    } catch {
      // keep current messages if the refresh fails
    }
    void loadConversations(searchQuery.trim() || undefined).catch(() => undefined);
  }

  async function send(override?: string) {
    const content = (override ?? text).trim();
    if ((!content && attachments.length === 0) || sending) return;
    setError(null);
    setCanRetry(false);

    let conversationId = activeId;
    if (!conversationId) {
      try {
        const conversation = await aiService.createConversation(content.slice(0, 60));
        conversationId = conversation.id;
        setActiveId(conversationId);
        setConversations((prev) => [conversation, ...prev]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not start a conversation');
        return;
      }
    }

    const optimistic: AiMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content || `Attached: ${attachments.map((a) => a.name).join(', ')}`,
      createdAt: new Date().toISOString(),
      attachments,
    };
    const sentAttachments = attachments;
    setMessages((prev) => [...prev, optimistic]);
    setText('');
    setAttachments([]);
    setSending(true);
    try {
      await aiService.sendMessage(conversationId, {
        content,
        attachments: sentAttachments.length ? sentAttachments : undefined,
      });
      await refresh(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not respond.');
      setCanRetry(true);
      // The backend saves the user message before calling the model, so refresh
      // to show it and let "Retry" regenerate the answer.
      await refresh(conversationId);
    } finally {
      setSending(false);
    }
  }

  async function regenerate() {
    if (!activeId || regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      await aiService.regenerate(activeId);
      await refresh(activeId);
      setCanRetry(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not respond.');
      setCanRetry(true);
      await refresh(activeId);
    } finally {
      setRegenerating(false);
    }
  }

  async function rename() {
    if (!renameTarget || !renameTitle.trim()) return;
    try {
      const updated = await aiService.renameConversation(renameTarget.id, renameTitle.trim());
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, title: updated.title } : c)),
      );
      setRenameTarget(null);
      toast.success('Conversation renamed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename conversation');
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    try {
      await aiService.deleteConversation(deleteTarget.id);
      const remaining = conversations.filter((c) => c.id !== deleteTarget.id);
      setConversations(remaining);
      setDeleteTarget(null);
      if (activeId === deleteTarget.id) {
        if (remaining[0]) await openConversation(remaining[0].id);
        else {
          setActiveId(null);
          setMessages([]);
        }
      }
      toast.success('Conversation deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete conversation');
    }
  }

  async function share() {
    if (!shareTarget) return;
    setShareBusy(true);
    try {
      const result = await aiService.share(shareTarget.id);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === shareTarget.id ? { ...c, shareEnabled: true, shareToken: result.token } : c,
        ),
      );
      setShareLink(absoluteUrl(result.path));
      setShareTarget({ ...shareTarget, shareEnabled: true, shareToken: result.token });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not share conversation');
    } finally {
      setShareBusy(false);
    }
  }

  async function unshare() {
    if (!shareTarget) return;
    setShareBusy(true);
    try {
      await aiService.unshare(shareTarget.id);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === shareTarget.id ? { ...c, shareEnabled: false, shareToken: null } : c,
        ),
      );
      setShareLink('');
      setShareTarget({ ...shareTarget, shareEnabled: false, shareToken: null });
      toast.success('Sharing turned off');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update sharing');
    } finally {
      setShareBusy(false);
    }
  }

  function openRenameDialog(conversation: AiConversation) {
    setRenameTarget(conversation);
    setRenameTitle(conversation.title);
  }

  function openShareDialog(conversation: AiConversation) {
    setShareTarget(conversation);
    setShareLink(
      conversation.shareToken ? absoluteUrl(`/shared/ai/${conversation.shareToken}`) : '',
    );
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy');
    }
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <div className="grid h-[calc(100vh-9.5rem)] gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
      {/* Sidebar */}
      <div
        className={cn(
          'flex-col overflow-hidden rounded-xl border border-border bg-surface',
          sidebarOpen ? 'fixed inset-0 z-40 m-2 flex' : 'hidden md:flex',
        )}
      >
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">Assistant chats</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="secondary" onClick={() => void newConversation()}>
                New
              </Button>
              {sidebarOpen && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-lg p-1.5 text-muted hover:bg-elevated md:hidden"
                  aria-label="Close chat list"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search chats…"
            className="h-9 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-subtle">
              {searchQuery ? 'No chats match your search.' : 'No conversations yet.'}
            </p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  'group flex items-center gap-2 border-b border-border/60 px-3 py-2.5',
                  conversation.id === activeId ? 'bg-elevated' : 'hover:bg-elevated/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => void openConversation(conversation.id)}
                  className="min-w-0 flex-1 py-2.5 pr-8 text-left"
                >
                  <p className="flex items-center gap-1.5 truncate text-sm text-foreground">
                    <span className="truncate">{conversation.title}</span>
                    {conversation.shareEnabled && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    )}
                  </p>
                  <p className="truncate text-[11px] text-subtle">
                    {conversation.messages?.[0]?.content || 'No messages yet'}
                  </p>
                  <p className="text-[10px] text-subtle">{timeAgo(conversation.updatedAt)}</p>
                </button>
                <ActionMenu
                  label={`Options for ${conversation.title}`}
                  side="bottom"
                  triggerClassName="absolute right-2 top-3 rounded-full p-1 text-subtle opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
                  items={[
                    {
                      label: 'Rename',
                      icon: <PencilIcon />,
                      onSelect: () => openRenameDialog(conversation),
                    },
                    {
                      label: conversation.shareEnabled ? 'Sharing options' : 'Share',
                      icon: <ShareIcon />,
                      onSelect: () => openShareDialog(conversation),
                    },
                    {
                      label: 'Delete',
                      icon: <TrashIcon />,
                      danger: true,
                      divider: true,
                      onSelect: () => setDeleteTarget(conversation),
                    },
                  ]}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close chat list"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      {/* Chat */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-muted hover:bg-elevated md:hidden"
            aria-label="Open chat list"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                {activeConversation?.title || 'QUITIN Assistant'}
              </p>
              {activeConversation?.shareEnabled && (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                  Shared
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-subtle">
              Powered by Gemini · answers may be inaccurate
            </p>
          </div>
          <div className="flex items-center gap-1">
            {activeConversation && (
              <ActionMenu
                label="Discussion options"
                side="bottom"
                triggerClassName="p-2"
                items={[
                  {
                    label: 'Rename discussion',
                    icon: <PencilIcon />,
                    onSelect: () => openRenameDialog(activeConversation),
                  },
                  {
                    label: activeConversation.shareEnabled ? 'Sharing options' : 'Share discussion',
                    icon: <ShareIcon />,
                    onSelect: () => openShareDialog(activeConversation),
                  },
                  {
                    label: 'Delete discussion',
                    icon: <TrashIcon />,
                    danger: true,
                    divider: true,
                    onSelect: () => setDeleteTarget(activeConversation),
                  },
                ]}
              />
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void newConversation()}
              className="md:hidden"
            >
              New
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
          {loadingThread ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto max-w-xl py-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-2xl">
                ✨
              </div>
              <p className="text-base font-semibold text-foreground">How can I help you today?</p>
              <p className="mt-1 text-sm text-subtle">
                Ask about code, careers or interviews. You can also attach a screenshot or a text
                file.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-xl border border-border bg-elevated px-3 py-2.5 text-left text-sm text-muted transition-colors hover:border-strong hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const mine = message.role === 'user';
              return (
                <div
                  key={message.id}
                  className={cn('group flex gap-2', mine ? 'justify-end' : 'justify-start')}
                >
                  {!mine && (
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm">
                      ✨
                    </span>
                  )}
                  <div className={cn('max-w-[85%]', mine ? 'text-right' : 'text-left')}>
                    <div
                      className={cn(
                        'inline-block rounded-2xl px-4 py-2.5 text-left',
                        mine
                          ? 'bg-accent text-white'
                          : 'bg-elevated text-foreground ring-1 ring-border',
                      )}
                    >
                      {mine ? (
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {message.content}
                        </p>
                      ) : (
                        <Markdown content={message.content} />
                      )}
                      <AttachmentList attachments={message.attachments ?? []} />
                    </div>
                    <div
                      className={cn(
                        'mt-1 flex items-center gap-1.5 text-[10px] text-subtle',
                        mine ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <span>{timeAgo(message.createdAt)}</span>
                      <ActionMenu
                        label="Message options"
                        side="top"
                        align={mine ? 'right' : 'left'}
                        triggerClassName="h-6 w-6 rounded-full p-1 text-subtle opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
                        items={[
                          {
                            label: 'Copy',
                            icon: <CopyIcon />,
                            onSelect: () => void copyMessage(message.content),
                          },
                          ...(!mine && message.id === lastAssistantId && !sending
                            ? [
                                {
                                  label: 'Regenerate',
                                  icon: <RefreshIcon />,
                                  disabled: regenerating,
                                  divider: true,
                                  onSelect: () => void regenerate(),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {(sending || regenerating) && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-elevated px-4 py-3 ring-1 ring-border">
                <span className="h-2 w-2 animate-pulse rounded-full bg-subtle" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-subtle [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-subtle [animation-delay:300ms]" />
                <span className="text-xs text-subtle">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-danger">
            <span className="flex-1">{error}</span>
            {canRetry && (
              <Button size="sm" variant="secondary" onClick={() => void regenerate()}>
                Retry
              </Button>
            )}
          </div>
        )}

        <div className="border-t border-border p-2.5 sm:p-3">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <div
                  key={`${attachment.url}-${index}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-elevated px-2 py-1.5 text-xs"
                >
                  {attachment.type === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      className="h-8 w-8 rounded object-cover"
                    />
                  ) : (
                    <span aria-hidden>📄</span>
                  )}
                  <span className="max-w-[160px] truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((current) => current.filter((_, i) => i !== index))
                    }
                    className="text-subtle hover:text-danger"
                    aria-label={`Remove ${attachment.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5">
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept="image/*,.txt,.md,.csv,.pdf"
              onChange={(event) => void uploadFiles(event.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-50"
              aria-label="Attach a file"
              title="Attach a file"
            >
              {uploading ? (
                <span className="block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Ask the assistant…"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border bg-elevated px-3 py-2.5 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            <Button
              onClick={() => void send()}
              loading={sending}
              disabled={(!text.trim() && attachments.length === 0) || uploading}
            >
              Send
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-subtle">
            The assistant can make mistakes. Verify important information.
          </p>
        </div>
      </div>

      <Modal
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename conversation"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void rename()} disabled={!renameTitle.trim()}>
              Save
            </Button>
          </>
        }
      >
        <input
          value={renameTitle}
          onChange={(event) => setRenameTitle(event.target.value)}
          maxLength={120}
          autoFocus
          className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
        />
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete conversation?"
        description="This permanently removes the chat and its messages."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{deleteTarget?.title}</p>
      </Modal>

      <Modal
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        title="Share conversation"
        description="Anyone with the link can read this conversation. You can turn sharing off at any time."
        size="sm"
      >
        {shareTarget && (
          <div className="space-y-3">
            {shareTarget.shareEnabled && shareLink ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated p-2">
                  <input
                    readOnly
                    value={shareLink}
                    className="min-w-0 flex-1 bg-transparent text-xs text-foreground focus:outline-none"
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareLink);
                        toast.success('Link copied');
                      } catch {
                        toast.error('Could not copy link');
                      }
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => void unshare()}
                  loading={shareBusy}
                >
                  Turn off sharing
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Sharing is off. Create a public link to let others read this conversation.
                </p>
                <Button className="w-full" onClick={() => void share()} loading={shareBusy}>
                  Create share link
                </Button>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
