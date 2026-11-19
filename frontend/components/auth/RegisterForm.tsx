'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface FormState {
  name: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  role: 'JOBSEEKER' | 'COMPANY';
}

function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'];
const STRENGTH_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-500',
  'bg-emerald-500',
];

export function RegisterForm() {
  const { register } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    role: 'JOBSEEKER',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const score = useMemo(() => passwordScore(form.password), [form.password]);

  function validate() {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email';
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(form.username))
      next.username = '3–30 letters, numbers or underscores';
    if (form.password.length < 8) next.password = 'At least 8 characters';
    if (form.confirmPassword !== form.password) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await register(form);
      toast.success('Welcome to QUITIN!');
      router.push('/feed');
      router.refresh();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create your account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <OAuthButtons action="Sign up" />

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-danger">
            {formError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            name="name"
            placeholder="Ada Lovelace"
            autoComplete="name"
            value={form.name}
            error={errors.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Username"
            name="username"
            placeholder="ada"
            autoComplete="username"
            value={form.username}
            error={errors.username}
            hint="How others find you"
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </div>

        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          error={errors.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">I am joining as</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'JOBSEEKER', label: 'Job seeker', hint: 'Find and apply to jobs' },
                { value: 'COMPANY', label: 'Company', hint: 'Post and manage jobs' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setForm({ ...form, role: option.value })}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  form.role === option.value
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-elevated hover:border-strong',
                )}
              >
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-subtle">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            {form.password && (
              <span
                className={cn(
                  'text-xs font-medium',
                  score >= 3 ? 'text-emerald-500' : score >= 2 ? 'text-amber-500' : 'text-danger',
                )}
              >
                {STRENGTH_LABELS[score]}
              </span>
            )}
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="h-10 w-full rounded-lg border border-border bg-elevated px-3 pr-12 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-1 text-xs font-medium text-subtle hover:text-foreground"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {form.password && (
            <div className="mt-1.5 flex gap-1">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={cn(
                    'h-1 flex-1 rounded-full',
                    index < score ? STRENGTH_COLORS[score] : 'bg-border',
                  )}
                />
              ))}
            </div>
          )}
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password}</p>}
        </div>

        <Input
          label="Confirm password"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={form.confirmPassword}
          error={errors.confirmPassword}
          onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
        />

        <p className="text-xs leading-relaxed text-subtle">
          By creating an account you agree to keep QUITIN a respectful place for everyone. You can
          change your privacy settings at any time.
        </p>

        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          Create account
        </Button>

        <p className="text-center text-sm text-subtle">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
