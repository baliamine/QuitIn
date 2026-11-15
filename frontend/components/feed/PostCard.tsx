'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useClickOutside } from '@/hooks/useClickOutside';
import { postsService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { absoluteUrl, cn, formatBytes, timeAgo } from '@/lib/utils';
import type { Comment, Post, ReactionType } from '@/types';

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'LIKE', emoji: '👍', label: 'Like' },
  { type: 'CELEBRATE', emoji: '🎉', label: 'Celebrate' },
  { type: 'SUPPORT', emoji: '🤝', label: 'Support' },
  { type: 'LOVE', emoji: '❤️', label: 'Love' },
  { type: 'INSIGHTFUL', emoji: '💡', label: 'Insightful' },
  { type: 'FUNNY', emoji: '😂', label: 'Funny' },
];

const REACTION_EMOJI: Record<string, string> = Object.fromEntries(
  REACTIONS.map((reaction) => [reaction.type, reaction.emoji]),
);

const REPORT_REASONS = [
  'Spam or misleading',
  'Harassment or hate speech',
  'Inappropriate content',
  'False information',
  'Something else',
];

function VisibilityIcon({ visibility }: { visibility: Post['visibility'] }) {
  if (visibility === 'PRIVATE') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  }
  if (visibility === 'FOLLOWERS') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" strokeLinecap="round" />
        <path d="M16 7h5M18.5 4.5v5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
    </svg>
  );
}

function Attachments({ attachments }: { attachments: NonNullable<Post['attachments']> }) {
  const images = attachments.filter((attachment) => attachment.type === 'IMAGE');
  const documents = attachments.filter((attachment) => attachment.type !== 'IMAGE');
  if (!attachments.length) return null;

  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 && (
        <div
          className={cn(
            'grid gap-1 overflow-hidden rounded-xl border border-border',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {images.map((image) => (
            <a
              key={image.id ?? image.url}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'block bg-elevated',
                images.length === 1 ? 'max-h-[420px]' : 'aspect-square',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.name}
                className={cn(
                  'h-full w-full object-cover transition-opacity hover:opacity-95',
                  images.length === 1 ? 'max-h-[420px]' : '',
                )}
              />
            </a>
          ))}
        </div>
      )}
      {documents.map((document) => (
        <a
          key={document.id ?? document.url}
          href={document.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5 transition-colors hover:bg-elevated-hover"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-accent">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
              <path d="M14 3v5h5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{document.name}</span>
            <span className="block text-xs text-subtle">{formatBytes(document.size)}</span>
          </span>
          <span className="text-xs text-accent">Open</span>
        </a>
      ))}
    </div>
  );
}

function EmbeddedPost({ post }: { post: Post }) {
  return (
    <Link
      href={`/post/${post.id}`}
      className="mt-3 block rounded-xl border border-border bg-background/60 p-3 transition-colors hover:border-strong"
    >
      <div className="flex items-center gap-2">
        <Avatar
          src={post.author.profile?.avatarUrl}
          name={post.author.username}
          size="sm"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{post.author.username}</p>
          <p className="truncate text-xs text-subtle">
            {post.author.profile?.headline || 'QUITIN member'} · {timeAgo(post.createdAt)}
          </p>
        </div>
      </div>
      {post.content && (
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-foreground">
          {post.content}
        </p>
      )}
      {post.attachments && post.attachments.length > 0 && (
        <Attachments attachments={post.attachments} />
      )}
      <p className="mt-2 text-xs text-subtle">
        {post.reactionCount} reaction{post.reactionCount === 1 ? '' : 's'} ·{' '}
        {post._count.comments} comment{post._count.comments === 1 ? '' : 's'}
      </p>
    </Link>
  );
}

function CommentItem({
  comment,
  postId,
  depth,
  onChanged,
  onReply,
}: {
  comment: Comment;
  postId: string;
  depth: number;
  onChanged: () => void;
  onReply: (comment: Comment) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [liked, setLiked] = useState(comment.likedByMe);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await postsService.likeComment(postId, comment.id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not react to comment');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await postsService.deleteComment(postId, comment.id);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete comment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('space-y-2', depth > 0 && 'ml-6 border-l border-border pl-3')}>
      <div className="flex gap-2">
        <Avatar
          src={comment.author.profile?.avatarUrl}
          name={comment.author.username}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-elevated px-3 py-2">
            <div className="flex items-baseline gap-2">
              <Link
                href={`/profile/${comment.author.username}`}
                className="text-sm font-semibold text-foreground hover:underline"
              >
                {comment.author.username}
              </Link>
              <span className="text-[11px] text-subtle">{timeAgo(comment.createdAt)}</span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{comment.content}</p>
          </div>
          <div className="mt-1 flex items-center gap-3 pl-2 text-xs">
            <button
              type="button"
              onClick={toggleLike}
              className={cn(
                'font-medium transition-colors',
                liked ? 'text-accent' : 'text-subtle hover:text-foreground',
              )}
            >
              {liked ? 'Liked' : 'Like'}
              {likeCount > 0 ? ` · ${likeCount}` : ''}
            </button>
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="font-medium text-subtle transition-colors hover:text-foreground"
            >
              Reply
            </button>
            {user?.id === comment.author.id && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="font-medium text-subtle transition-colors hover:text-danger"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
      {(comment.replies ?? []).map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          postId={postId}
          depth={depth + 1}
          onChanged={onChanged}
          onReply={onReply}
        />
      ))}
    </div>
  );
}

export function PostCard({
  post,
  onDeleted,
  onUpdated,
  defaultCommentsOpen = false,
  className,
}: {
  post: Post;
  onDeleted?: (id: string) => void;
  onUpdated?: (post: Post) => void;
  defaultCommentsOpen?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const toast = useToast();

  const [content, setContent] = useState(post.content);
  const [editedAt, setEditedAt] = useState(post.editedAt);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(post.myReaction);
  const [reactions, setReactions] = useState<Record<string, number>>(post.reactions ?? {});
  const [reactionCount, setReactionCount] = useState(post.reactionCount ?? post._count.likes);
  const [commentCount, setCommentCount] = useState(post._count.comments);
  const [expanded, setExpanded] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [repostMenuOpen, setRepostMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const repostRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);
  useClickOutside(pickerRef, () => setPickerOpen(false), pickerOpen);
  useClickOutside(repostRef, () => setRepostMenuOpen(false), repostMenuOpen);

  const [commentsOpen, setCommentsOpen] = useState(defaultCommentsOpen);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareQuery, setShareQuery] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [repostText, setRepostText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isOwn = user?.id === post.author.id;
  const rootPost = post.repostOf ?? null;
  const isLong = content.length > 480;

  const summaryReactions = useMemo(
    () =>
      Object.entries(reactions)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
    [reactions],
  );

  const commentTree = useMemo(() => {
    const roots: Comment[] = [];
    const map = new Map<string, Comment>();
    comments.forEach((comment) => map.set(comment.id, { ...comment, replies: [] }));
    map.forEach((comment) => {
      if (comment.parentId && map.has(comment.parentId)) {
        map.get(comment.parentId)!.replies!.push(comment);
      } else {
        roots.push(comment);
      }
    });
    return roots;
  }, [comments]);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const list = await postsService.comments(post.id);
      setComments(list);
      setCommentsLoaded(true);
      setCommentCount(list.length);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load comments');
    } finally {
      setLoadingComments(false);
    }
  }, [post.id, toast]);

  useEffect(() => {
    if (commentsOpen && !commentsLoaded) void loadComments();
  }, [commentsOpen, commentsLoaded, loadComments]);

  async function react(type: ReactionType) {
    setPickerOpen(false);
    try {
      const result = await postsService.react(post.id, type);
      setReactions(result.reactions);
      setReactionCount(result.reactionCount);
      setMyReaction(result.myReaction);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not react to this post');
    }
  }

  async function submitComment() {
    const text = newComment.trim();
    if (!text || commentBusy) return;
    setCommentBusy(true);
    try {
      const created = await postsService.addComment(post.id, {
        content: text,
        parentId: replyTo?.id,
      });
      setNewComment('');
      setReplyTo(null);
      if (commentsLoaded) {
        setComments((current) => [...current, created]);
        setCommentCount((count) => count + 1);
      } else {
        await loadComments();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add comment');
    } finally {
      setCommentBusy(false);
    }
  }

  async function saveEdit() {
    const text = editContent.trim();
    if (!text) return;
    setBusy(true);
    try {
      const updated = await postsService.update(post.id, { content: text });
      setContent(updated.content);
      setEditedAt(updated.editedAt);
      setEditOpen(false);
      onUpdated?.(updated);
      toast.success('Post updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update post');
    } finally {
      setBusy(false);
    }
  }

  async function removePost() {
    setMenuOpen(false);
    setDeleteOpen(true);
  }

  async function confirmDeletePost() {
    setBusy(true);
    try {
      await postsService.remove(post.id);
      setDeleteOpen(false);
      onDeleted?.(post.id);
      toast.success('Post deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete post');
    } finally {
      setBusy(false);
    }
  }

  async function hidePost() {
    setMenuOpen(false);
    try {
      await postsService.hide(post.id);
      onDeleted?.(post.id);
      toast.info('Post hidden from your feed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not hide post');
    }
  }

  async function reportPost() {
    setBusy(true);
    try {
      await postsService.report(post.id, reportReason, reportDetails || undefined);
      setReportOpen(false);
      setReportDetails('');
      toast.success('Report submitted. Thank you for keeping QUITIN safe.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit report');
    } finally {
      setBusy(false);
    }
  }

  async function repost() {
    setBusy(true);
    try {
      await postsService.repost(post.id, repostText.trim() || undefined);
      setRepostOpen(false);
      setRepostText('');
      toast.success('Reposted to your network');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not repost');
    } finally {
      setBusy(false);
    }
  }

  async function shareWithUser(username: string) {
    setShareBusy(true);
    try {
      await postsService.share(post.id, { username });
      setShareOpen(false);
      setShareQuery('');
      toast.success(`Sent to ${username}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share post');
    } finally {
      setShareBusy(false);
    }
  }

  async function copyLink() {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(absoluteUrl(`/post/${post.id}`));
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  }

  const shareSuggestions = useMemo(() => {
    const query = shareQuery.trim().toLowerCase();
    if (!query) return [];
    const seen = new Set<string>();
    const list: { username: string; headline: string | null; avatarUrl: string | null }[] = [];
    for (const source of [post.author, ...(post.repostOf ? [post.repostOf.author] : [])]) {
      if (source.username.toLowerCase().includes(query) && !seen.has(source.id)) {
        seen.add(source.id);
        list.push({
          username: source.username,
          headline: source.profile?.headline ?? null,
          avatarUrl: source.profile?.avatarUrl ?? null,
        });
      }
    }
    return list;
  }, [shareQuery, post.author, post.repostOf]);

  return (
    <article
      className={cn(
        'rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors sm:p-5',
        className,
      )}
    >
      {rootPost && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M17 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <Link href={`/profile/${post.author.username}`} className="font-medium hover:underline">
            {post.author.username}
          </Link>{' '}
          reposted
        </p>
      )}

      <div className="flex items-start gap-3">
        <Link href={`/profile/${post.author.username}`}>
          <Avatar src={post.author.profile?.avatarUrl} name={post.author.username} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2">
                <Link
                  href={`/profile/${post.author.username}`}
                  className="truncate text-sm font-semibold text-foreground hover:underline"
                >
                  {post.author.username}
                </Link>
                {post.author.profile?.headline && (
                  <span className="hidden truncate text-xs text-subtle sm:inline">
                    {post.author.profile.headline}
                  </span>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-subtle">
                <span>{timeAgo(post.createdAt)}</span>
                {editedAt && <span>· edited</span>}
                <span aria-label={`Visibility: ${post.visibility}`} className="text-subtle">
                  <VisibilityIcon visibility={post.visibility} />
                </span>
              </p>
            </div>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-label="Post options"
                onClick={() => setMenuOpen((open) => !open)}
                className="rounded-full p-1.5 text-subtle transition-colors hover:bg-elevated hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                  {isOwn && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setEditContent(content);
                          setEditOpen(true);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-elevated"
                      >
                        Edit post
                      </button>
                      <button
                        type="button"
                        onClick={removePost}
                        className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-elevated"
                      >
                        Delete post
                      </button>
                    </>
                  )}
                  {!isOwn && (
                    <>
                      <button
                        type="button"
                        onClick={hidePost}
                        className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-elevated"
                      >
                        Hide this post
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setReportOpen(true);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-elevated"
                      >
                        Report post
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={copyLink}
                    className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-elevated"
                  >
                    Copy link
                  </button>
                </div>
              )}
            </div>
          </div>

          {rootPost ? (
            <>
              {content && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{content}</p>
              )}
              <EmbeddedPost post={rootPost} />
            </>
          ) : (
            <>
              {content && (
                <div className="mt-2">
                  <p
                    className={cn(
                      'whitespace-pre-wrap text-sm leading-relaxed text-foreground',
                      !expanded && isLong && 'line-clamp-6',
                    )}
                  >
                    {content}
                  </p>
                  {isLong && (
                    <button
                      type="button"
                      onClick={() => setExpanded((value) => !value)}
                      className="mt-1 text-xs font-medium text-accent hover:underline"
                    >
                      {expanded ? 'See less' : 'See more'}
                    </button>
                  )}
                </div>
              )}
              {post.attachments && post.attachments.length > 0 && (
                <Attachments attachments={post.attachments} />
              )}
              {!post.attachments?.length && post.imageUrl && (
                <div className="mt-3 overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.imageUrl} alt="Post attachment" className="max-h-[420px] w-full object-cover" />
                </div>
              )}
            </>
          )}

          {(reactionCount > 0 || commentCount > 0) && (
            <div className="mt-3 flex items-center justify-between border-b border-border pb-2 text-xs text-subtle">
              <span className="flex items-center gap-1">
                {summaryReactions.length > 0 ? (
                  <>
                    {summaryReactions.map(([type, count]) => (
                      <span key={type} className="flex items-center gap-0.5" title={`${count} ${type.toLowerCase()}`}>
                        <span aria-hidden>{REACTION_EMOJI[type] ?? '👍'}</span>
                        <span>{count}</span>
                      </span>
                    ))}
                  </>
                ) : (
                  <span>{reactionCount} reactions</span>
                )}
              </span>
              <span>
                {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : ''}
              </span>
            </div>
          )}

          <div className="mt-1 flex items-center justify-between gap-1">
            <div className="relative" ref={pickerRef}>
              {pickerOpen && (
                <div className="absolute bottom-11 left-0 z-20 flex gap-1 rounded-full border border-border bg-surface px-2 py-1.5 shadow-xl">
                  {REACTIONS.map((reaction) => (
                    <button
                      key={reaction.type}
                      type="button"
                      title={reaction.label}
                      aria-label={reaction.label}
                      onClick={() => react(reaction.type)}
                      className={cn(
                        'rounded-full p-1.5 text-lg transition-transform hover:scale-125',
                        myReaction === reaction.type && 'bg-elevated',
                      )}
                    >
                      {reaction.emoji}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onMouseEnter={() => setPickerOpen(true)}
                onClick={() => react(myReaction ?? 'LIKE')}
                className={cn(
                  'flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-elevated',
                  myReaction ? 'text-accent' : 'text-muted hover:text-foreground',
                )}
              >
                {myReaction ? (
                  <span aria-hidden>{REACTION_EMOJI[myReaction]}</span>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3Z" />
                    <path d="M7 10l4-7a2 2 0 0 1 3.7 1.2L14 9h5.2a2 2 0 0 1 2 2.4l-1.3 7A2 2 0 0 1 18 20H7" />
                  </svg>
                )}
                <span>{myReaction ? REACTIONS.find((r) => r.type === myReaction)?.label : 'Like'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCommentsOpen((open) => !open)}
              className="flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-elevated hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">Comment</span>
            </button>

            <div className="relative" ref={repostRef}>
              <button
                type="button"
                onClick={() => setRepostMenuOpen((open) => !open)}
                className="flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M17 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Repost</span>
              </button>
              {repostMenuOpen && (
                <div className="absolute bottom-11 right-0 z-20 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setRepostMenuOpen(false);
                      setRepostOpen(true);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-elevated"
                  >
                    Repost with your thoughts
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRepostMenuOpen(false);
                      void repost();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-elevated"
                  >
                    Repost instantly
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-elevated hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>

          {commentsOpen && (
            <div className="mt-2 border-t border-border pt-3">
              {loadingComments && !commentsLoaded ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : comments.length === 0 ? (
                <p className="py-2 text-sm text-subtle">No comments yet. Start the conversation.</p>
              ) : (
                <div className="space-y-3">
                  {commentTree.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      postId={post.id}
                      depth={0}
                      onChanged={loadComments}
                      onReply={(target) => {
                        setReplyTo(target);
                        document.getElementById(`comment-input-${post.id}`)?.focus();
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="mt-3">
                {replyTo && (
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-elevated px-3 py-1.5 text-xs text-muted">
                    <span className="truncate">
                      Replying to <strong className="text-foreground">{replyTo.author.username}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="ml-2 text-subtle hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Avatar src={user?.profile?.avatarUrl} name={user?.username ?? 'You'} size="sm" />
                  <textarea
                    id={`comment-input-${post.id}`}
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void submitComment();
                      }
                    }}
                    rows={1}
                    placeholder={replyTo ? `Reply to ${replyTo.author.username}…` : 'Write a comment…'}
                    className="max-h-32 min-h-9 flex-1 resize-none rounded-xl border border-border bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
                  />
                  <Button size="sm" onClick={submitComment} loading={commentBusy} disabled={!newComment.trim()}>
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit post"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={busy} disabled={!editContent.trim()}>
              Save changes
            </Button>
          </>
        }
      >
        <Textarea
          value={editContent}
          onChange={(event) => setEditContent(event.target.value)}
          rows={6}
          maxLength={5000}
          label="Post text"
        />
      </Modal>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report post"
        description="Tell us what is wrong with this post. Reports are anonymous."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={reportPost} loading={busy}>
              Submit report
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor={`report-reason-${post.id}`} className="mb-1.5 block text-sm font-medium">
              Reason
            </label>
            <select
              id={`report-reason-${post.id}`}
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
            >
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            label="Details (optional)"
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Add anything that helps us review this post."
          />
        </div>
      </Modal>

      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Send post"
        description="Send this post to someone in your network."
        size="sm"
      >
        <div className="space-y-3">
          <input
            value={shareQuery}
            onChange={(event) => setShareQuery(event.target.value)}
            placeholder="Search by username"
            className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
          />
          {shareSuggestions.length > 0 ? (
            <div className="space-y-1">
              {shareSuggestions.map((person) => (
                <button
                  key={person.username}
                  type="button"
                  disabled={shareBusy}
                  onClick={() => shareWithUser(person.username)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-elevated disabled:opacity-60"
                >
                  <Avatar src={person.avatarUrl} name={person.username} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{person.username}</span>
                    {person.headline && (
                      <span className="block truncate text-xs text-subtle">{person.headline}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title={shareQuery ? 'No matching people' : 'Type a username'}
              description={
                shareQuery
                  ? 'Try the exact username of the person you want to send this post to.'
                  : 'Search for a person, then click their name to send the post in a direct message.'
              }
            />
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => {
              await copyLink();
              setShareOpen(false);
            }}
          >
            Copy link instead
          </Button>
        </div>
      </Modal>

      <Modal
        open={repostOpen}
        onClose={() => setRepostOpen(false)}
        title="Repost with your thoughts"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRepostOpen(false)}>
              Cancel
            </Button>
            <Button onClick={repost} loading={busy}>
              Repost
            </Button>
          </>
        }
      >
        <Textarea
          value={repostText}
          onChange={(event) => setRepostText(event.target.value)}
          rows={4}
          maxLength={3000}
          placeholder="Add a comment (optional)"
        />
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete post?"
        description="This action cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void confirmDeletePost()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Delete this post permanently? This cannot be undone.</p>
      </Modal>
    </article>
  );
}
