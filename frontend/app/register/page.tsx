import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata = { title: 'Create account · QUITIN' };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Join QUITIN"
      subtitle="Create your professional profile in less than a minute."
      footer={
        <>
          Already building with us?{' '}
          <a href="/login" className="font-medium text-accent hover:underline">
            Log in instead
          </a>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
