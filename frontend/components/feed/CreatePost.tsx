'use client';

import { useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { postsService, uploadService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatBytes } from '@/lib/utils';
import type { Attachment, Post, PostVisibility } from '@/types';

const MAX_IMAGES = 4;
const MAX_DOCUMENTS = 4;

export function CreatePost({ onCreated }: { onCreated?: (post: Post) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('PUBLIC');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showVisibility, setShowVisibility] = useState(false);

  const imageInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!user) return null;

  const expanded = focused || content.length > 0 || attachments.length > 0;

  async function uploadFiles(files: FileList | null, kind: 'image' | 'document') {
    if (!files?.length) return;
    const limit = kind === 'image' ? MAX_IMAGES : MAX_DOCUMENTS;
    const existing = attachments.filter((attachment) =>
      kind === 'image' ? attachment.type === 'IMAGE' : attachment.type !== 'IMAGE',
    );
    const selected = Array.from(files).slice(0, Math.max(limit - existing.length, 0));
    if (!selected.length) {
      toast.error(
        kind === 'image'
          ? `You can attach up to ${MAX_IMAGES} images`
          : `You can attach up to ${MAX_DOCUMENTS} documents`,
      );
      return;
    }

    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of selected) {
        const maxSize = kind === 'image' ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
        if (file.size > maxSize) {
          toast.error(`${file.name} is larger than ${formatBytes(maxSize)}`);
          continue;
        }
        const result = await uploadService.file(file);
        uploaded.push({ ...result, type: kind === 'image' ? 'IMAGE' : 'DOCUMENT' });
      }
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = '';
      if (documentInput.current) documentInput.current.value = '';
    }
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, i) => i !== index));
  }

  async function submit() {
    const trimmed = content.trim();
    if ((!trimmed && attachments.length === 0) || submitting) return;
    setSubmitting(true);
    try {
      const post = await postsService.create({
        content: trimmed,
        visibility,
        attachments: attachments.map(({ url, name, mimeType, size, type }) => ({
          url,
          name,
          mimeType,
          size,
          type,
        })),
      });
      setContent('');
      setAttachments([]);
      setVisibility('PUBLIC');
      setFocused(false);
      onCreated?.(post);
      toast.success('Your post is live');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not publish post');
    } finally {
      setSubmitting(false);
    }
  }

  function autoGrow(element: HTMLTextAreaElement) {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex gap-3">
        <Avatar src={user.profile?.avatarUrl} name={user.username} />
        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              autoGrow(event.target);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              window.setTimeout(() => {
                if (!content && attachments.length === 0) setFocused(false);
              }, 150);
            }}
            rows={expanded ? 3 : 1}
            maxLength={5000}
            placeholder="Share an update, a project or an idea…"
            className={cn(
              'w-full resize-none rounded-xl border border-transparent bg-elevated px-3 py-2.5 text-sm text-foreground placeholder:text-subtle',
              'transition-colors focus:border-border focus:outline-none focus:ring-2 focus:ring-accent/40',
            )}
          />

          {attachments.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {attachments.map((attachment, index) => (
                <div
                  key={`${attachment.url}-${index}`}
                  className="group relative overflow-hidden rounded-xl border border-border bg-elevated"
                >
                  {attachment.type === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      className="h-28 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-28 flex-col items-center justify-center gap-1 px-3 text-center">
                      <svg viewBox="0 0 24 24" className="h-6 w-6 text-accent" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                        <path d="M14 3v5h5" />
                      </svg>
                      <span className="line-clamp-2 text-xs font-medium text-foreground">{attachment.name}</span>
                      <span className="text-[11px] text-subtle">{formatBytes(attachment.size)}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.name}`}
                    onClick={() => removeAttachment(index)}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white transition-colors hover:bg-black"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {expanded && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
              <div className="flex items-center gap-1">
                <input
                  ref={imageInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => uploadFiles(event.target.files, 'image')}
                />
                <input
                  ref={documentInput}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md,.csv,.ppt,.pptx,.xls,.xlsx,.zip"
                  multiple
                  hidden
                  onChange={(event) => uploadFiles(event.target.files, 'document')}
                />
                <button
                  type="button"
                  onClick={() => imageInput.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <circle cx="9" cy="10" r="1.6" />
                    <path d="m4 17 4.5-4.5L13 17l3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Photo
                </button>
                <button
                  type="button"
                  onClick={() => documentInput.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-500" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 3v5h5M9 13h6M9 17h4" strokeLinecap="round" />
                  </svg>
                  Document
                </button>
                {uploading && (
                  <span className="ml-1 flex items-center gap-1.5 text-xs text-subtle">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" />
                    Uploading…
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowVisibility((value) => !value)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-elevated hover:text-foreground"
                  >
                    {visibility === 'PUBLIC' && '🌍 Anyone'}
                    {visibility === 'FOLLOWERS' && '👥 Followers'}
                    {visibility === 'PRIVATE' && '🔒 Only me'}
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {showVisibility && (
                    <div className="absolute bottom-10 right-0 z-20 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                      {(
                        [
                          ['PUBLIC', '🌍 Anyone', 'Visible to everyone on QUITIN'],
                          ['FOLLOWERS', '👥 Followers', 'Only people who follow you'],
                          ['PRIVATE', '🔒 Only me', 'Just you can see this post'],
                        ] as [PostVisibility, string, string][]
                      ).map(([value, label, hint]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setVisibility(value);
                            setShowVisibility(false);
                          }}
                          className={cn(
                            'block w-full px-3 py-2 text-left text-sm hover:bg-elevated',
                            visibility === value ? 'text-accent' : 'text-foreground',
                          )}
                        >
                          <span className="block font-medium">{label}</span>
                          <span className="block text-[11px] text-subtle">{hint}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-subtle">{content.length}/5000</span>
                <Button
                  size="sm"
                  onClick={submit}
                  loading={submitting}
                  disabled={(!content.trim() && attachments.length === 0) || uploading}
                >
                  Post
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
