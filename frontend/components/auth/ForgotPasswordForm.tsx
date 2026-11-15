'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authService } from '@/lib/services';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setSubmitting(true);
    try {
      const result = await authService.forgotPassword(email.trim());
      setSent(true);
      if (result.devResetToken) setDevToken(result.devResetToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. The link
          expires in one hour.
        </div>
        {devToken && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Email is not configured on this server.</p>
            <p className="mt-1 text-xs">
              Use this development link to reset the password now:
            </p>
            <Link
              href={`/reset-password?token=${encodeURIComponent(devToken)}`}
              className="mt-2 inline-block break-all text-xs font-medium underline"
            >
              Open reset link
            </Link>
          </div>
        )}
        <Button variant="secondary" className="w-full" onClick={() => setSent(false)}>
          Use a different email
        </Button>
        <p className="text-center text-sm text-subtle">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      <p className="text-sm text-muted">
        Enter the email address you use on QUITIN and we will send you a link to choose a new
        password.
      </p>
      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button type="submit" className="w-full" size="lg" loading={submitting}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-subtle">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
