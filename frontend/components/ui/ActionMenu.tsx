'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void | Promise<void>;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string;
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  className?: string;
  triggerClassName?: string;
}

type IconProps = { className?: string };

export function MoreIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function ReplyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="m9 8-5 4 5 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h9a7 7 0 0 1 7 7v1" strokeLinecap="round" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M14.5 5.5 18.5 9.5M4 20l4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.2 16.1 4 20Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="m15 3 6 6-3 1-4 4v4l-2 2-4-4-4 4 4-4-4-4 2-2h4l4-4 1-3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SmileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" strokeLinecap="round" />
    </svg>
  );
}

export function ArchiveIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" strokeLinecap="round" />
    </svg>
  );
}

export function BellOffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M6 8a6 6 0 0 1 9.3-5M18 8v6l2 3H8M10 20h4M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

export function ShareIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M14 5h5v5M19 5l-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-4 w-4', className)} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M20 11a8 8 0 1 0-.7 4.5M20 5v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ActionMenu({
  items,
  label = 'More actions',
  align = 'right',
  side = 'bottom',
  className,
  triggerClassName,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const menu = menuRef.current;
      const width = menu?.offsetWidth ?? 190;
      const height = menu?.offsetHeight ?? 200;
      const margin = 8;
      const gap = 6;

      let top = side === 'top' ? rect.top - height - gap : rect.bottom + gap;
      let left = align === 'right' ? rect.right - width : rect.left;

      if (top + height > window.innerHeight - margin) top = rect.top - height - gap;
      if (top < margin) top = rect.bottom + gap;

      left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin));
      top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, align, side]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <div
        ref={containerRef}
        className={cn('relative', className)}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          title={label}
          className={cn(
            'inline-flex items-center justify-center rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50',
            triggerClassName,
          )}
        >
          <MoreIcon />
        </button>
      </div>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              visibility: position ? 'visible' : 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
            className="z-[100] max-h-[320px] min-w-[190px] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl shadow-black/10"
          >
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.divider && <div className="my-1 h-px bg-border" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={async () => {
                    setOpen(false);
                    await item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50',
                    item.danger ? 'text-danger' : 'text-foreground',
                  )}
                >
                  {item.icon && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-80">
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                </button>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
