'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authService } from '@/lib/services';

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await authService.verifyEmail(token);
        if (cancelled) return;
        if (!result?.success) {
          setStatus('error');
          setError('This link is not valid or has expired.');
          return;
        }
        setStatus('success');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Could not verify your email');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-600">
          ✓
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          {status === 'verifying' ? 'Verifying your email…' : status === 'success' ? 'Email verified' : 'Verification failed'}
        </h1>
        {status === 'error' && error && (
          <p className="mt-2 text-sm text-danger">{error}</p>
        )}
        {status !== 'error' && (
          <p className="mt-2 text-sm text-muted">
            {status === 'success'
              ? 'Your QUITIN account is now fully verified. You can log in.'
              : 'One moment…' }
          </p>
        )}
      </div>
      {status === 'success' && (
        <a
          href="/login"
          className="flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Continue to log in
        </a>
      )}
    </div>
  );
}
