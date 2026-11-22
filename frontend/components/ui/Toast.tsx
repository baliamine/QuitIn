'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_DURATION = 2800;

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  // One toast at a time. A new action replaces the previous one so alerts never
  // stack up, and tapping the toast dismisses it immediately.
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const remove = useCallback(() => {
    clear();
    setItem(null);
  }, [clear]);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      clear();
      counter += 1;
      setItem({ id: counter, kind, message });
      timer.current = window.setTimeout(() => {
        setItem(null);
        timer.current = null;
      }, TOAST_DURATION);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {item && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] justify-end sm:bottom-6 sm:right-6">
          <button
            key={item.id}
            type="button"
            role="status"
            onClick={remove}
            className={cn(
              'animate-toast-in pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm shadow-2xl backdrop-blur-xl transition-transform hover:-translate-y-0.5',
              item.kind === 'success' &&
                'border-success/40 bg-success/15 text-success shadow-success/10',
              item.kind === 'error' && 'border-danger/40 bg-danger/15 text-danger shadow-danger/10',
              item.kind === 'info' &&
                'border-accent/40 bg-surface/95 text-foreground shadow-accent/10',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                item.kind === 'success' && 'bg-success/20 text-success',
                item.kind === 'error' && 'bg-danger/20 text-danger',
                item.kind === 'info' && 'bg-accent/20 text-accent',
              )}
            >
              {item.kind === 'success' ? '✓' : item.kind === 'error' ? '!' : 'i'}
            </span>
            <span className="flex-1 leading-snug">{item.message}</span>
            <span aria-hidden className="text-subtle transition-colors hover:text-foreground">
              ×
            </span>
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
