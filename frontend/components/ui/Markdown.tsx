'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text: string) {
  return text
    .replace(/`([^`]+)`/g, '<code class="rounded bg-elevated px-1 py-0.5 text-[0.85em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a class="text-accent underline underline-offset-2" href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    );
}

/**
 * Small, dependency-free Markdown renderer for AI answers.
 * Input is HTML-escaped before any markup is added, so model output cannot
 * inject HTML or scripts into the page.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => {
    const blocks = content.split(/```/);
    return blocks
      .map((block, index) => {
        if (index % 2 === 1) {
          const lines = block.replace(/^\w*\n/, '');
          return `<pre class="my-3 overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs leading-relaxed"><code>${escapeHtml(
            lines,
          )}</code></pre>`;
        }

        const escaped = escapeHtml(block);
        const lines = escaped.split(/\r?\n/);
        const out: string[] = [];
        let listType: 'ul' | 'ol' | null = null;

        const closeList = () => {
          if (listType) {
            out.push(`</${listType}>`);
            listType = null;
          }
        };

        for (const raw of lines) {
          const line = raw.trimEnd();
          if (!line.trim()) {
            closeList();
            continue;
          }
          const heading = line.match(/^(#{1,3})\s+(.*)$/);
          if (heading) {
            closeList();
            const level = heading[1].length;
            out.push(
              `<h${level + 2} class="mt-4 mb-2 font-semibold text-foreground">${inline(
                heading[2],
              )}</h${level + 2}>`,
            );
            continue;
          }
          const bullet = line.match(/^\s*[-*]\s+(.*)$/);
          if (bullet) {
            if (listType !== 'ul') {
              closeList();
              out.push('<ul class="my-2 list-disc space-y-1 pl-5">');
              listType = 'ul';
            }
            out.push(`<li>${inline(bullet[1])}</li>`);
            continue;
          }
          const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
          if (numbered) {
            if (listType !== 'ol') {
              closeList();
              out.push('<ol class="my-2 list-decimal space-y-1 pl-5">');
              listType = 'ol';
            }
            out.push(`<li>${inline(numbered[1])}</li>`);
            continue;
          }
          if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
            closeList();
            out.push('<hr class="my-4 border-border" />');
            continue;
          }
          if (line.startsWith('&gt; ')) {
            closeList();
            out.push(
              `<blockquote class="my-2 border-l-2 border-border pl-3 text-muted">${inline(
                line.slice(5),
              )}</blockquote>`,
            );
            continue;
          }
          closeList();
          out.push(`<p class="my-1.5 leading-relaxed whitespace-pre-wrap">${inline(line)}</p>`);
        }
        closeList();
        return out.join('');
      })
      .join('');
  }, [content]);

  return (
    <div
      className={cn('break-words text-sm', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
