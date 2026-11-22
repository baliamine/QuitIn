'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { authService } from '@/lib/services';

export function VerifyEmailClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const isEmailChange = searchParams.get('type') === 'email_change';
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
        const result = isEmailChange
          ? await authService.confirmEmailChange(token)
          : await authService.verifyEmail(token);
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
  }, [token, isEmailChange]);

  const title =
    status === 'verifying'
      ? isEmailChange
        ? 'Confirming your new email…'
        : 'Verifying your email…'
      : status === 'success'
        ? isEmailChange
          ? 'Email updated'
          : 'Email verified'
        : 'Verification failed';

  const description =
    status === 'success'
      ? isEmailChange
        ? 'Your new QUITIN email address is active. You can keep using your account.'
        : 'Your QUITIN account is now fully verified. You can log in.'
      : status === 'verifying'
        ? 'One moment…'
        : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-2xl text-accent">
          ✓
        </div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {status === 'error' && error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {description && <p className="mt-2 text-sm text-muted">{description}</p>}
      </div>
      <a
        href={status === 'success' && isEmailChange ? '/settings?tab=security' : '/login'}
        className="flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover"
      >
        {status === 'success' && isEmailChange ? 'Back to settings' : 'Continue to log in'}
      </a>
    </div>
  );
}
