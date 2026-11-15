import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata = { title: 'Forgot password · QUITIN' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter the email you use on QUITIN and we will send you a secure reset link."
      footer={
        <p>
          Remembered it?{' '}
          <a href="/login" className="font-medium text-accent hover:underline">
            Back to log in
          </a>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
