import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { VerifyEmailClient } from '@/components/auth/VerifyEmailClient';

export const metadata = { title: 'Verify email · QUITIN' };

function VerifyEmailFallback() {
  return (
    <div className="h-64 animate-pulse rounded-xl bg-elevated/50" />
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Verify your email"
      subtitle="We are confirming your QUITIN account email address."
      footer={
        <p>
          The link expires quickly.{' '}
          <a href="/login" className="font-medium text-accent hover:underline">
            Go to log in
          </a>
        </p>
      }
    >
      <Suspense fallback={<VerifyEmailFallback />}>
        <VerifyEmailClient />
      </Suspense>
    </AuthShell>
  );
}
