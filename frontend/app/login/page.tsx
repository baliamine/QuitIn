import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = { title: 'Log in · QUITIN' };

function noticeFor(params: { oauth?: string; provider?: string; reset?: string; verified?: string }) {
  if (params.oauth === 'unconfigured') {
    const provider = params.provider
      ? params.provider.charAt(0).toUpperCase() + params.provider.slice(1)
      : 'This provider';
    return `${provider} sign-in is not configured yet. Add the OAuth client ID and secret to backend/.env, then restart the backend.`;
  }
  if (params.oauth === 'error') {
    return 'We could not complete that sign-in. Please try again or use your email and password.';
  }
  if (params.reset) {
    return 'Your password was updated. Log in with your new password.';
  }
  if (params.verified) {
    return 'Your email is verified. Log in to continue.';
  }
  return undefined;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: {
    redirect?: string;
    oauth?: string;
    provider?: string;
    reset?: string;
    verified?: string;
  };
}) {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to keep up with your network, messages and the assistant."
      footer={
        <>
          Need help? Contact support at{' '}
          <span className="font-medium text-muted">support@quitin.dev</span>
        </>
      }
    >
      <LoginForm redirectTo={searchParams.redirect} notice={noticeFor(searchParams)} />
    </AuthShell>
  );
}
