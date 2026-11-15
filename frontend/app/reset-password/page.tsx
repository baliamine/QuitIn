import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata = { title: 'Reset password · QUITIN' };

function ResetPasswordFallback() {
  return (
    <div className="h-64 animate-pulse rounded-xl bg-elevated/50" />
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Choose a new password for your QUITIN account."
      footer={
        <p>
          Remembered it?{' '}
          <a href="/login" className="font-medium text-accent hover:underline">
            Back to log in
          </a>
        </p>
      }
    >
      <Suspense fallback={<ResetPasswordFallback />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
