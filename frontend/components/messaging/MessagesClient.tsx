'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  ActionMenu,
  ArchiveIcon,
  BellOffIcon,
  InfoIcon,
  PencilIcon,
  PinIcon,
  ReplyIcon,
  SmileIcon,
  TrashIcon,
} from '@/components/ui/ActionMenu';
import { useCall } from '@/components/calls/CallProvider';
import { conversationsService, uploadService, usersService } from '@/lib/services';
import { emitWithAck, getSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatBytes, formatDay, formatTime, timeAgo } from '@/lib/utils';
import type { Attachment, Conversation, Message, User } from '@/types';

const QUICK_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface',
        online ? 'bg-emerald-500' : 'bg-slate-400',
      )}
      title={online ? 'Online' : 'Offline'}
    />
  );
}

function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.type === 'IMAGE');
  const docs = attachments.filter((a) => a.type !== 'IMAGE');
  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {images.map((image) => (
            <a
              key={image.id ?? image.url}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-lg border border-black/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.name} className="max-h-48 w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {docs.map((doc) => (
        <a
          key={doc.id ?? doc.url}
          href={doc.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg border border-current/10 bg-black/5 px-2 py-1.5 text-xs hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <span aria-hidden>📄</span>
          <span className="min-w-0 flex-1 truncate font-medium">{doc.name}</span>
          <span className="shrink-0 opacity-70">{formatBytes(doc.size)}</span>
        </a>
      ))}
    </div>
  );
}

interface MessageActionsProps {
  mine: boolean;
  pinned?: boolean;
  pinning?: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
}

function MessageActions({
  mine,
  pinned,
  pinning,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onPin,
}: MessageActionsProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!emojiOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setEmojiOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEmojiOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [emojiOpen]);

  return (
    <div
      ref={emojiRef}
      className="relative flex shrink-0 items-start self-center opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
    >
      <ActionMenu
        label="Message options"
        side="top"
        align={mine ? 'right' : 'left'}
        triggerClassName="rounded-full p-1 text-subtle hover:bg-elevated hover:text-foreground"
        items={[
          {
            label: 'React',
            icon: <SmileIcon />,
            onSelect: () => setEmojiOpen(true),
          },
          {
            label: 'Reply',
            icon: <ReplyIcon />,
            onSelect: onReply,
          },
          {
            label: pinned ? 'Unpin message' : 'Pin message',
            icon: <PinIcon />,
            disabled: pinning,
            onSelect: onPin,
          },
          ...(mine
            ? [
                {
                  label: 'Edit',
                  icon: <PencilIcon />,
                  divider: true,
                  onSelect: onEdit,
                },
                {
                  label: 'Delete',
                  icon: <TrashIcon />,
                  danger: true,
                  onSelect: onDelete,
                },
              ]
            : []),
        ]}
      />

      {emojiOpen && (
        <div
          className={cn(
            'absolute bottom-full z-40 mb-1 flex gap-0.5 rounded-full border border-border bg-surface px-1.5 py-1 shadow-xl',
            mine ? 'right-0' : 'left-0',
          )}
        >
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setEmojiOpen(false);
                onReact(emoji);
              }}
              className="rounded-full p-1 text-base transition-transform hover:scale-125"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessagesClient() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const { startCall } = useCall();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [listQuery, setListQuery] = useState('');
  const [archivedView, setArchivedView] = useState(false);
  const [threadQuery, setThreadQuery] = useState('');
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [people, setPeople] = useState<User[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [mobileThread, setMobileThread] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const typingActive = useRef(false);
  const handledDeepLink = useRef(false);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const other = activeConversation?.otherParticipants[0] ?? null;

  const loadConversations = useCallback(async (opts?: { archived?: boolean; q?: string }) => {
    try {
      const res = await conversationsService.list({
        archived: opts?.archived ?? archivedView,
        q: opts?.q ?? (listQuery.trim() || undefined),
      });
      setConversations(res.conversations);
      setActiveId((current) => {
        if (current && res.conversations.some((c) => c.id === current)) return current;
        return res.conversations[0]?.id ?? null;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load conversations');
    } finally {
      setLoadingList(false);
    }
  }, [archivedView, listQuery, toast]);

  const openConversation = useCallback(
    async (id: string) => {
      setActiveId(id);
      setMobileThread(true);
      setLoadingThread(true);
      setThreadQuery('');
      setThreadSearchOpen(false);
      setReplyTo(null);
      setEditingId(null);
      try {
        const res = await conversationsService.messages(id);
        setMessages(res.messages);
        await conversationsService.read(id);
        getSocket().emit('conversation:join', { conversationId: id });
        getSocket().emit('message:read', { conversationId: id });
        setConversations((current) =>
          current.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not open conversation');
      } finally {
        setLoadingThread(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivedView]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadConversations({ q: listQuery.trim() || undefined });
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery]);

  // Deep links: ?to=username / ?with=username / ?c=conversationId
  useEffect(() => {
    if (handledDeepLink.current) return;
    const username = searchParams.get('to') || searchParams.get('with');
    const conversationId = searchParams.get('c');
    if (!username && !conversationId) return;
    handledDeepLink.current = true;
    void (async () => {
      try {
        if (conversationId) {
          await openConversation(conversationId);
          return;
        }
        if (username) {
          const { conversation } = await conversationsService.create({ username });
          await loadConversations();
          await openConversation(conversation.id);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not start the conversation');
      }
    })();
  }, [searchParams, loadConversations, openConversation, toast]);

  // Socket wiring
  useEffect(() => {
    const socket = getSocket();

    const onNewMessage = (message: Message) => {
      if (message.conversationId === activeId) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        if (message.sender.id !== user?.id) {
          getSocket().emit('message:read', { conversationId: message.conversationId });
        }
      }
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === message.conversationId);
        if (!existing) {
          void loadConversations();
          return prev;
        }
        const updated = prev.map((c) =>
          c.id === message.conversationId
            ? {
                ...c,
                lastMessage: message,
                unreadCount:
                  message.sender.id === user?.id || message.conversationId === activeId
                    ? 0
                    : (c.unreadCount ?? 0) + 1,
              }
            : c,
        );
        return updated.sort(
          (a, b) =>
            new Date(b.lastMessage?.createdAt ?? 0).getTime() -
            new Date(a.lastMessage?.createdAt ?? 0).getTime(),
        );
      });
    };

    const onMessageUpdated = (message: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === message.conversationId && c.lastMessage?.id === message.id
            ? { ...c, lastMessage: message }
            : c,
        ),
      );
    };

    const onRead = (payload: { conversationId: string; userId: string; readAt: string }) => {
      if (payload.userId === user?.id) return;
      if (payload.conversationId === activeId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.sender.id === user?.id && !m.readAt ? { ...m, readAt: payload.readAt } : m,
          ),
        );
      }
    };

    const onTypingStart = (payload: {
      conversationId: string;
      userId: string;
      username: string;
    }) => {
      if (payload.userId === user?.id) return;
      setTypingUsers((prev) => ({ ...prev, [payload.conversationId]: payload.username }));
    };

    const onTypingStop = (payload: { conversationId: string; userId: string }) => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        delete next[payload.conversationId];
        return next;
      });
    };

    const onPresence = (payload: {
      userId: string;
      online: boolean;
      lastActiveAt: string;
    }) => {
      setPresence((prev) => ({ ...prev, [payload.userId]: payload.online }));
    };

    const onConversationUpdated = () => {
      void loadConversations();
    };

    socket.on('message:new', onNewMessage);
    socket.on('message:updated', onMessageUpdated);
    socket.on('conversation:read', onRead);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('presence:update', onPresence);
    socket.on('conversation:updated', onConversationUpdated);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:updated', onMessageUpdated);
      socket.off('conversation:read', onRead);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('presence:update', onPresence);
      socket.off('conversation:updated', onConversationUpdated);
    };
  }, [activeId, loadConversations, user?.id]);

  // Query presence for everyone in the list.
  useEffect(() => {
    const ids = Array.from(
      new Set(conversations.flatMap((c) => c.otherParticipants.map((p) => p.id))),
    );
    if (!ids.length) return;
    getSocket().emit(
      'presence:query',
      { userIds: ids },
      (result: { userId: string; online: boolean }[]) => {
        if (!Array.isArray(result)) return;
        setPresence((prev) => {
          const next = { ...prev };
          result.forEach((entry) => {
            next[entry.userId] = entry.online;
          });
          return next;
        });
      },
    );
  }, [conversations]);

  useEffect(() => {
    if (activeId) void openConversation(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // People search for the "new message" dialog.
  useEffect(() => {
    if (!newChatOpen) return;
    const term = peopleQuery.trim();
    if (!term) {
      setPeople([]);
      return;
    }
    const handle = window.setTimeout(() => {
      usersService
        .search(term, 8)
        .then((res) => setPeople(res.users))
        .catch(() => setPeople([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [peopleQuery, newChatOpen]);

  async function startConversation(username: string) {
    try {
      const { conversation } = await conversationsService.create({ username });
      setNewChatOpen(false);
      setPeopleQuery('');
      setPeople([]);
      setArchivedView(false);
      await loadConversations({ archived: false });
      await openConversation(conversation.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start conversation');
    }
  }

  function emitTyping(value: string) {
    if (!activeId) return;
    const socket = getSocket();
    if (value.trim() && !typingActive.current) {
      typingActive.current = true;
      socket.emit('typing:start', { conversationId: activeId });
    }
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(() => {
      typingActive.current = false;
      socket.emit('typing:stop', { conversationId: activeId });
    }, 1500);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files).slice(0, 5)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 20 MB`);
          continue;
        }
        const result = await uploadService.file(file);
        uploaded.push(result);
      }
      setAttachments((current) => [...current, ...uploaded].slice(0, 5));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function send() {
    const content = text.trim();
    if ((!content && attachments.length === 0) || !activeId || sending) return;
    setSending(true);
    const sentText = text;
    setText('');
    setAttachments([]);
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    typingActive.current = false;
    getSocket().emit('typing:stop', { conversationId: activeId });
    try {
      const socket = getSocket();
      let message: Message;
      if (socket.connected) {
        const response = await emitWithAck<{ ok: boolean; message?: Message; error?: string }>(
          'message:send',
          {
            conversationId: activeId,
            content,
            replyToId: replyTo?.id,
            attachments: attachments.length ? attachments : undefined,
          },
        );
        if (!response?.ok || !response.message) {
          throw new Error(response?.error || 'Could not send message');
        }
        message = response.message;
      } else {
        message = await conversationsService.send(activeId, {
          content,
          replyToId: replyTo?.id,
          attachments: attachments.length ? attachments : undefined,
        });
      }
      setReplyTo(null);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setConversations((prev) =>
        prev
          .map((c) => (c.id === activeId ? { ...c, lastMessage: message, unreadCount: 0 } : c))
          .sort(
            (a, b) =>
              new Date(b.lastMessage?.createdAt ?? 0).getTime() -
              new Date(a.lastMessage?.createdAt ?? 0).getTime(),
          ),
      );
    } catch (error) {
      setText(sentText);
      toast.error(error instanceof Error ? error.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(messageId: string) {
    const content = editingText.trim();
    if (!content) return;
    try {
      const updated = await conversationsService.editMessage(messageId, content);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      setEditingId(null);
      setEditingText('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not edit message');
    }
  }

  async function togglePin(messageId: string) {
    if (pinningId) return;
    setPinningId(messageId);
    try {
      const updated = await conversationsService.pinMessage(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      toast.success(updated.pinned ? 'Message pinned' : 'Message unpinned');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update pinned message');
    } finally {
      setPinningId(null);
    }
  }

  async function confirmDeleteMessage() {
    const messageId = messageToDelete;
    if (!messageId) return;
    try {
      const updated = await conversationsService.deleteMessage(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete message');
    } finally {
      setMessageToDelete(null);
    }
  }

  async function react(messageId: string, emoji: string) {
    try {
      const updated = await conversationsService.reactMessage(messageId, emoji);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not react to message');
    }
  }

  async function openConversationDetails(id: string) {
    await openConversation(id);
    setInfoOpen(true);
  }

  async function toggleFlag(flag: 'archived' | 'muted', conversationId = activeId) {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (!conversationId || !conversation) return;
    const next = flag === 'archived' ? !conversation.archived : !conversation.muted;
    try {
      await conversationsService.update(conversationId, { [flag]: next });
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, [flag]: next } : c)),
      );
      toast.success(
        flag === 'archived'
          ? next
            ? 'Conversation archived'
            : 'Conversation restored'
          : next
            ? 'Notifications muted'
            : 'Notifications unmuted',
      );
      if (flag === 'archived') {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        if (activeId === conversationId) {
          setActiveId(null);
          setMobileThread(false);
        }
      }
      if (infoOpen && activeId === conversationId) setInfoOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update conversation');
    }
  }

  async function deleteConversation(conversationId = conversationToDelete) {
    if (!conversationId) return;
    try {
      await conversationsService.remove(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeId === conversationId) {
        setActiveId(null);
        setMobileThread(false);
      }
      setInfoOpen(false);
      setConversationToDelete(null);
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete conversation');
    }
  }

  async function searchThread(query: string) {
    setThreadQuery(query);
    if (!activeId) return;
    try {
      const res = await conversationsService.messages(activeId, query.trim() || undefined);
      setMessages(res.messages);
    } catch {
      // keep current messages on search failure
    }
  }

  const typingName = activeId ? typingUsers[activeId] : undefined;
  const isOnline = other ? Boolean(presence[other.id]) : false;
  const pinnedMessages = messages.filter((message) => message.pinned && !message.deleted);

  return (
    <div className="grid h-[calc(100vh-9.5rem)] gap-4 md:grid-cols-[330px_minmax(0,1fr)]">
      {/* Conversation list */}
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-xl border border-border bg-surface',
          mobileThread && 'hidden md:flex',
        )}
      >
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-base font-semibold text-foreground">Messages</h1>
            <Button size="sm" onClick={() => setNewChatOpen(true)}>
              New
            </Button>
          </div>
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              value={listQuery}
              onChange={(event) => setListQuery(event.target.value)}
              placeholder="Search conversations…"
              className="h-9 w-full rounded-lg border border-border bg-elevated pl-8 pr-3 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setArchivedView(false)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                !archivedView ? 'bg-elevated text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              Inbox
            </button>
            <button
              type="button"
              onClick={() => setArchivedView(true)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                archivedView ? 'bg-elevated text-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              Archived
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {archivedView ? 'No archived conversations' : 'No conversations yet'}
              </p>
              <p className="mt-1 text-xs text-subtle">
                {archivedView
                  ? 'Archived chats will appear here.'
                  : 'Start a chat with someone in your network.'}
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const person = conversation.otherParticipants[0];
              const active = conversation.id === activeId;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group relative flex items-center border-b border-border/60 transition-colors',
                    active ? 'bg-elevated' : 'hover:bg-elevated/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-11 text-left"
                  >
                    <span className="relative">
                      <Avatar
                        src={person?.profile?.avatarUrl}
                        name={person?.username ?? 'User'}
                        size="md"
                      />
                      <PresenceDot online={Boolean(person && presence[person.id])} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {person?.username ?? 'Unknown'}
                        </p>
                        {conversation.lastMessage && (
                          <span className="shrink-0 text-[10px] text-subtle">
                            {timeAgo(conversation.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            'flex min-w-0 items-center truncate text-xs',
                            (conversation.unreadCount ?? 0) > 0
                              ? 'font-medium text-foreground'
                              : 'text-subtle',
                          )}
                        >
                          {conversation.lastMessage?.pinned && (
                            <PinIcon className="mr-1 h-3 w-3 shrink-0 text-accent" />
                          )}
                          <span className="truncate">
                            {conversation.lastMessage?.deleted
                              ? 'Message deleted'
                              : conversation.lastMessage?.content ||
                                (conversation.lastMessage?.attachments?.length
                                  ? '📎 Attachment'
                                  : 'No messages yet')}
                          </span>
                        </p>
                        <span className="flex shrink-0 items-center gap-1">
                          {conversation.muted && <BellOffIcon className="h-3 w-3 text-subtle" />}
                          {(conversation.unreadCount ?? 0) > 0 && (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                              {conversation.unreadCount}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </button>
                  <ActionMenu
                    label={`Options for ${person?.username ?? 'conversation'}`}
                    side="bottom"
                    triggerClassName="absolute right-2 top-4 rounded-full p-1 text-subtle opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
                    items={[
                      {
                        label: 'Conversation details',
                        icon: <InfoIcon />,
                        onSelect: () => void openConversationDetails(conversation.id),
                      },
                      {
                        label: conversation.muted ? 'Unmute notifications' : 'Mute notifications',
                        icon: <BellOffIcon />,
                        onSelect: () => void toggleFlag('muted', conversation.id),
                      },
                      {
                        label: conversation.archived ? 'Restore conversation' : 'Archive conversation',
                        icon: <ArchiveIcon />,
                        onSelect: () => void toggleFlag('archived', conversation.id),
                      },
                      {
                        label: 'Delete conversation',
                        icon: <TrashIcon />,
                        danger: true,
                        divider: true,
                        onSelect: () => setConversationToDelete(conversation.id),
                      },
                    ]}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Thread */}
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-xl border border-border bg-surface',
          !mobileThread && 'hidden md:flex',
        )}
      >
        {!activeConversation ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              title="Select a conversation"
              description="Choose a conversation from the list or start a new one."
              icon={<span className="text-2xl">💬</span>}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 sm:px-4">
              <button
                type="button"
                onClick={() => setMobileThread(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-elevated md:hidden"
                aria-label="Back to conversations"
              >
                ←
              </button>
              <span className="relative">
                <Avatar src={other?.profile?.avatarUrl} name={other?.username ?? 'User'} size="sm" />
                <PresenceDot online={isOnline} />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={other ? `/profile/${other.username}` : '#'}
                  className="block truncate text-sm font-semibold text-foreground hover:underline"
                >
                  {other?.username ?? 'Unknown'}
                </Link>
                <p className="truncate text-[11px] text-subtle">
                  {typingName ? (
                    <span className="text-accent">{typingName} is typing…</span>
                  ) : isOnline ? (
                    <span className="text-emerald-500">Online</span>
                  ) : (
                    other?.profile?.headline || 'Offline'
                  )}
                </p>
              </div>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setThreadSearchOpen((open) => !open)}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-foreground"
                  aria-label="Search in conversation"
                  title="Search in conversation"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9}>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => other && startCall(other.username, 'AUDIO')}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-foreground"
                  aria-label="Start audio call"
                  title="Audio call"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9}>
                    <path d="M4 4h4l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => other && startCall(other.username, 'VIDEO')}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-foreground"
                  aria-label="Start video call"
                  title="Video call"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9}>
                    <rect x="3" y="6" width="12" height="12" rx="2" />
                    <path d="m15 10 6-3v10l-6-3" strokeLinejoin="round" />
                  </svg>
                </button>
                <ActionMenu
                  label="Conversation options"
                  side="bottom"
                  triggerClassName="p-2"
                  items={[
                    {
                      label: 'Conversation details',
                      icon: <InfoIcon />,
                      onSelect: () => setInfoOpen(true),
                    },
                    {
                      label: activeConversation.muted ? 'Unmute notifications' : 'Mute notifications',
                      icon: <BellOffIcon />,
                      onSelect: () => void toggleFlag('muted'),
                    },
                    {
                      label: activeConversation.archived
                        ? 'Restore conversation'
                        : 'Archive conversation',
                      icon: <ArchiveIcon />,
                      onSelect: () => void toggleFlag('archived'),
                    },
                    {
                      label: 'Delete conversation',
                      icon: <TrashIcon />,
                      danger: true,
                      divider: true,
                      onSelect: () => setConversationToDelete(activeConversation.id),
                    },
                  ]}
                />
              </div>
            </div>

            {threadSearchOpen && (
              <div className="flex items-center gap-2 border-b border-border bg-background/60 px-3 py-2">
                <input
                  value={threadQuery}
                  onChange={(event) => void searchThread(event.target.value)}
                  placeholder="Search messages…"
                  autoFocus
                  className="h-8 flex-1 rounded-lg border border-border bg-elevated px-3 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
                />
                <button
                  type="button"
                  onClick={() => {
                    setThreadSearchOpen(false);
                    setThreadQuery('');
                    void searchThread('');
                  }}
                  className="text-xs font-medium text-muted hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}

            {pinnedMessages.length > 0 && !threadQuery && (
              <div className="mx-3 mt-2 rounded-xl border border-accent/25 bg-accent/5">
                <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
                  <PinIcon className="h-3 w-3" />
                  Pinned · {pinnedMessages.length}
                </div>
                <div className="flex gap-2 overflow-x-auto p-2">
                  {pinnedMessages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() =>
                        document
                          .getElementById(`message-${message.id}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }
                      className="max-w-[240px] shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left text-xs text-muted hover:border-accent/50 hover:text-foreground"
                    >
                      <span className="block truncate font-medium text-foreground">
                        {message.sender.username}
                      </span>
                      <span className="block truncate">{message.content || 'Attachment'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-4">
              {loadingThread ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {threadQuery ? 'No matching messages' : 'No messages yet'}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    {threadQuery ? 'Try a different search.' : 'Say hello 👋'}
                  </p>
                </div>
              ) : (
                messages.map((message, index) => {
                  const mine = message.sender.id === user?.id;
                  const previous = messages[index - 1];
                  const showDay =
                    !previous ||
                    new Date(previous.createdAt).toDateString() !==
                      new Date(message.createdAt).toDateString();
                  const grouped =
                    previous &&
                    previous.sender.id === message.sender.id &&
                    new Date(message.createdAt).getTime() -
                      new Date(previous.createdAt).getTime() <
                      5 * 60 * 1000 &&
                    !showDay;
                  return (
                    <div key={message.id} id={`message-${message.id}`}>
                      {showDay && (
                        <div className="my-4 flex items-center gap-3">
                          <span className="h-px flex-1 bg-border" />
                          <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                            {formatDay(message.createdAt)}
                          </span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <div className={cn('group flex gap-2', mine ? 'flex-row-reverse' : 'flex-row')}>
                        {!grouped ? (
                          <Avatar
                            src={message.sender.profile?.avatarUrl}
                            name={message.sender.username}
                            size="sm"
                            className="mt-auto"
                          />
                        ) : (
                          <span className="w-8 shrink-0" />
                        )}

                        <div className={cn('min-w-0 max-w-[78%]', mine ? 'items-end' : 'items-start')}>
                          {!grouped && (
                            <p
                              className={cn(
                                'mb-0.5 text-[11px] font-medium text-subtle',
                                mine ? 'text-right' : 'text-left',
                              )}
                            >
                              {mine ? 'You' : message.sender.username} ·{' '}
                              {formatTime(message.createdAt)}
                            </p>
                          )}
                          <div className={cn('relative', mine ? 'text-right' : 'text-left')}>
                            {editingId === message.id ? (
                              <div className="w-full min-w-[220px] rounded-xl border border-border bg-surface p-2 text-left">
                                <textarea
                                  value={editingText}
                                  onChange={(event) => setEditingText(event.target.value)}
                                  rows={3}
                                  className="w-full resize-none rounded-lg border border-border bg-elevated px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
                                />
                                <div className="mt-1 flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingId(null);
                                      setEditingText('');
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button size="sm" onClick={() => void saveEdit(message.id)}>
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  'inline-block max-w-full rounded-2xl px-3.5 py-2 text-left text-sm',
                                  message.deleted
                                    ? 'bg-elevated italic text-subtle ring-1 ring-border'
                                    : mine
                                      ? 'bg-accent text-white'
                                      : 'bg-elevated text-foreground ring-1 ring-border',
                                  mine ? 'rounded-br-md' : 'rounded-bl-md',
                                )}
                              >
                                {message.pinned && !message.deleted && (
                                  <div
                                    className={cn(
                                      'mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide',
                                      mine ? 'text-white/80' : 'text-accent',
                                    )}
                                  >
                                    <PinIcon className="h-3 w-3" />
                                    Pinned
                                  </div>
                                )}
                                {message.replyTo && (
                                  <div
                                    className={cn(
                                      'mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs',
                                      mine
                                        ? 'border-white/50 bg-white/10 text-white/80'
                                        : 'border-accent/60 bg-accent/5 text-muted',
                                    )}
                                  >
                                    <p className="font-semibold">
                                      {message.replyTo.sender.username}
                                    </p>
                                    <p className="line-clamp-2">
                                      {message.replyTo.content || 'Attachment'}
                                    </p>
                                  </div>
                                )}
                                {message.deleted ? (
                                  <p>This message was deleted</p>
                                ) : (
                                  <>
                                    {message.content && (
                                      <p className="whitespace-pre-wrap break-words">
                                        {message.content}
                                      </p>
                                    )}
                                    <MessageAttachments attachments={message.attachments ?? []} />
                                  </>
                                )}
                                <p
                                  className={cn(
                                    'mt-1 flex items-center justify-end gap-1 text-[10px]',
                                    mine && !message.deleted ? 'text-white/70' : 'text-subtle',
                                  )}
                                >
                                  {message.edited && <span>edited</span>}
                                  <span>{formatTime(message.createdAt)}</span>
                                  {mine && !message.deleted && (
                                    <span title={message.readAt ? 'Read' : 'Sent'}>
                                      {message.readAt ? '✓✓' : '✓'}
                                    </span>
                                  )}
                                </p>
                              </div>
                            )}

                            {Object.keys(message.reactions ?? {}).length > 0 && (
                              <div
                                className={cn(
                                  'mt-1 flex flex-wrap gap-1',
                                  mine ? 'justify-end' : 'justify-start',
                                )}
                              >
                                {Object.entries(message.reactions ?? {}).map(([emoji, value]) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => void react(message.id, emoji)}
                                    className={cn(
                                      'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors',
                                      value.userIds.includes(user?.id ?? '')
                                        ? 'border-accent/50 bg-accent/10 text-accent'
                                        : 'border-border bg-surface text-muted hover:bg-elevated',
                                    )}
                                    title={`${value.count} reaction${value.count === 1 ? '' : 's'}`}
                                  >
                                    <span aria-hidden>{emoji}</span>
                                    <span>{value.count}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {!message.deleted && editingId !== message.id && (
                          <MessageActions
                            mine={mine}
                            pinned={message.pinned}
                            pinning={pinningId === message.id}
                            onReact={(emoji) => void react(message.id, emoji)}
                            onReply={() => {
                              setReplyTo(message);
                              document.getElementById('message-composer')?.focus();
                            }}
                            onEdit={() => {
                              setEditingId(message.id);
                              setEditingText(message.content);
                            }}
                            onDelete={() => setMessageToDelete(message.id)}
                            onPin={() => void togglePin(message.id)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {typingName && (
                <div className="flex items-center gap-2 px-1 pt-2 text-xs text-subtle">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subtle [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subtle [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-subtle [animation-delay:240ms]" />
                  </span>
                  {typingName} is typing…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-border p-2.5 sm:p-3">
              {replyTo && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-muted">
                    Replying to <strong className="text-foreground">{replyTo.sender.username}</strong>
                    : {replyTo.content || 'Attachment'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="shrink-0 text-subtle hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <div
                      key={`${attachment.url}-${index}`}
                      className="group relative flex items-center gap-2 rounded-lg border border-border bg-elevated px-2 py-1.5 text-xs"
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
                      <span className="max-w-[140px] truncate">{attachment.name}</span>
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
                  multiple
                  hidden
                  accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.ppt,.pptx,.xls,.xlsx,.zip"
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
                  id="message-composer"
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    emitTyping(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  maxLength={4000}
                  placeholder="Write a message…"
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border bg-elevated px-3 py-2.5 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
                />
                <Button
                  onClick={() => void send()}
                  loading={sending}
                  disabled={(!text.trim() && attachments.length === 0) || uploading}
                  aria-label="Send message"
                >
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* New conversation dialog */}
      <Modal
        open={newChatOpen}
        onClose={() => {
          setNewChatOpen(false);
          setPeopleQuery('');
          setPeople([]);
        }}
        title="New message"
        description="Search for someone by username to start a conversation."
        size="sm"
      >
        <div className="space-y-3">
          <input
            value={peopleQuery}
            onChange={(event) => setPeopleQuery(event.target.value)}
            placeholder="Search people…"
            autoFocus
            className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
          />
          {people.length > 0 ? (
            <div className="space-y-1">
              {people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => void startConversation(person.username)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-elevated"
                >
                  <Avatar src={person.profile?.avatarUrl} name={person.username} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {person.username}
                    </span>
                    {person.profile?.headline && (
                      <span className="block truncate text-xs text-subtle">
                        {person.profile.headline}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-subtle">
              {peopleQuery ? 'No matching people.' : 'Start typing to search for people.'}
            </p>
          )}
        </div>
      </Modal>

      {/* Conversation details */}
      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Conversation details"
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setInfoOpen(false)}>
            Close
          </Button>
        }
      >
        {activeConversation && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar src={other?.profile?.avatarUrl} name={other?.username ?? 'User'} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {other?.username ?? 'Unknown'}
                </p>
                <p className="truncate text-xs text-subtle">
                  {other?.profile?.headline || 'QUITIN member'}
                </p>
              </div>
            </div>
            <div className="space-y-1 rounded-xl border border-border p-2 text-sm">
              <button
                type="button"
                onClick={() => void toggleFlag('muted')}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 hover:bg-elevated"
              >
                <span>Mute notifications</span>
                <span className="text-xs text-subtle">
                  {activeConversation.muted ? 'On' : 'Off'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void toggleFlag('archived')}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 hover:bg-elevated"
              >
                <span>Archive conversation</span>
                <span className="text-xs text-subtle">
                  {activeConversation.archived ? 'On' : 'Off'}
                </span>
              </button>
              {other && (
                <Link
                  href={`/profile/${other.username}`}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 hover:bg-elevated"
                >
                  <span>View profile</span>
                  <span className="text-xs text-subtle">→</span>
                </Link>
              )}
            </div>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                setInfoOpen(false);
                setConversationToDelete(activeConversation.id);
              }}
            >
              Delete conversation
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={conversationToDelete !== null}
        onClose={() => setConversationToDelete(null)}
        title="Delete conversation?"
        description="This removes the conversation from your inbox. The other person keeps their copy."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConversationToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void deleteConversation()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          New messages from this person will start a fresh conversation.
        </p>
      </Modal>

      <Modal
        open={messageToDelete !== null}
        onClose={() => setMessageToDelete(null)}
        title="Delete message?"
        description="This removes the message for everyone in the conversation."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMessageToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDeleteMessage()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Delete this message? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
