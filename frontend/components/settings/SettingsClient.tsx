'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { usersService, uploadService, authService } from '@/lib/services';
import { applyTheme, getTheme, THEME_CHANGE_EVENT, type Theme } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatMonthYear } from '@/lib/utils';
import type { Education, Experience, User } from '@/types';

type SettingsTab = 'profile' | 'privacy' | 'security' | 'appearance' | 'danger';

const TABS: SettingsTab[] = ['profile', 'privacy', 'security', 'appearance', 'danger'];

const TAB_LABELS: Record<SettingsTab, string> = {
  profile: 'Profile',
  privacy: 'Privacy',
  security: 'Security',
  appearance: 'Appearance',
  danger: 'Danger zone',
};

const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export function SettingsClient() {
  const { user, refresh, logout } = useAuth();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const requestedTab = (searchParams.get('tab') || 'profile') as SettingsTab;
  const activeTab: SettingsTab = TABS.includes(requestedTab) ? requestedTab : 'profile';

  useEffect(() => {
    setTab(activeTab);
  }, [activeTab]);

  const isCompany = user?.role === 'COMPANY';

  const [profile, setProfile] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [theme, setThemeState] = useState<Theme>('dark');

  const [form, setForm] = useState({
    username: '',
    headline: '',
    bio: '',
    location: '',
    company: '',
    website: '',
    skills: '',
    industry: '',
    companySize: '',
    foundedYear: '',
  });

  const [privacy, setPrivacy] = useState<{
    visibility: 'PUBLIC' | 'PRIVATE';
    messagingPermission: 'EVERYONE' | 'FOLLOWERS';
  }>({
    visibility: 'PUBLIC',
    messagingPermission: 'EVERYONE',
  });

  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [followRequests, setFollowRequests] = useState<{ id: string; user: User }[]>([]);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [emailForm, setEmailForm] = useState({ email: '', currentPassword: '' });
  const [emailBusy, setEmailBusy] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  useEffect(() => {
    setThemeState(getTheme());
    const sync = () => setThemeState(getTheme());
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  function hydrate(full: User) {
    setProfile(full);
    setForm({
      username: full.username ?? '',
      headline: full.profile?.headline ?? '',
      bio: full.profile?.bio ?? '',
      location: full.profile?.location ?? '',
      company: full.profile?.company ?? '',
      website: full.profile?.website ?? '',
      skills: (full.profile?.skills ?? []).map((s) => s.name).join(', '),
      industry: full.profile?.industry ?? '',
      companySize: full.profile?.companySize ?? '',
      foundedYear: full.profile?.foundedYear ?? '',
    });
    setPrivacy({
      visibility: full.profile?.visibility ?? 'PUBLIC',
      messagingPermission: full.profile?.messagingPermission ?? 'EVERYONE',
    });
  }

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        hydrate(await usersService.getProfile(user.username));
      } catch {
        toast.error('Could not load your profile.');
      }
      try {
        const blocked = await usersService.blocked();
        setBlockedUsers(blocked.users);
      } catch {
        // Blocked list is optional.
      }
      try {
        const requests = await usersService.followRequests();
        setFollowRequests(requests.requests);
      } catch {
        // Follow requests are optional.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function reloadProfile(nextUsername?: string) {
    const username = nextUsername ?? user?.username;
    if (!username) return;
    const full = await usersService.getProfile(username);
    hydrate(full);
    await refresh();
  }

  async function saveProfile() {
    const nextUsername = form.username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(nextUsername)) {
      toast.error('Use 3-30 letters, numbers, dots, dashes or underscores');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        username: nextUsername,
        headline: form.headline || undefined,
        bio: form.bio || undefined,
        location: form.location || undefined,
        website: form.website || undefined,
      };
      if (isCompany) {
        payload.industry = form.industry || undefined;
        payload.companySize = form.companySize || undefined;
        payload.foundedYear = form.foundedYear || undefined;
      } else {
        payload.company = form.company || undefined;
        payload.skills = form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      await usersService.updateProfile(payload);
      await reloadProfile(nextUsername);
      toast.success(isCompany ? 'Company profile updated' : 'Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function savePrivacy() {
    setPrivacySaving(true);
    try {
      await usersService.updateProfile({
        visibility: privacy.visibility,
        messagingPermission: privacy.messagingPermission,
      });
      await reloadProfile();
      toast.success('Privacy settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save privacy settings.');
    } finally {
      setPrivacySaving(false);
    }
  }

  async function unblock(username: string) {
    try {
      await usersService.unblock(username);
      setBlockedUsers((await usersService.blocked()).users);
      toast.success(`Unblocked @${username}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not unblock user');
    }
  }

  async function acceptFollowRequest(id: string) {
    try {
      const result = await usersService.acceptFollowRequest(id);
      setFollowRequests((prev) => prev.filter((entry) => entry.id !== id));
      await refresh();
      toast.success(result.success ? 'Follow request accepted' : 'Follow request updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept follow request');
    }
  }

  async function rejectFollowRequest(id: string) {
    try {
      const result = await usersService.rejectFollowRequest(id);
      setFollowRequests((prev) => prev.filter((entry) => entry.id !== id));
      await refresh();
      toast.success(result.success ? 'Follow request declined' : 'Follow request updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline follow request');
    }
  }

  async function changePassword() {
    if (passwordForm.newPassword.length < 8) {
      toast.error('Use at least 8 characters for the new password');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      await authService.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword,
      );
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setChangingPassword(false);
    }
  }

  async function changeEmail() {
    const nextEmail = emailForm.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      toast.error('Enter a valid email address');
      return;
    }
    setEmailBusy(true);
    try {
      const result = await authService.changeEmail(nextEmail, emailForm.currentPassword || undefined);
      setEmailForm({ email: '', currentPassword: '' });
      if (result.autoApplied) {
        await reloadProfile();
        toast.success('Email updated');
      } else {
        await reloadProfile();
        toast.success(
          result.sent ? `Verification sent to ${nextEmail}` : `Confirm the link sent to ${nextEmail}`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change your email.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function resendVerification() {
    setResendingVerification(true);
    try {
      const result = await authService.resendVerification();
      await reloadProfile();
      toast.success(result.sent ? 'Verification email sent' : 'Account already verified');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend verification email');
    } finally {
      setResendingVerification(false);
    }
  }

  async function deleteAccount() {
    if (!user) return;
    setDeleteBusy(true);
    try {
      await usersService.deleteAccount(deletePassword);
      setDeleteOpen(false);
      setDeletePassword('');
      toast.success('Your account was deleted');
      await logout();
      window.location.href = '/login';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete account');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadService.avatar(file);
      await usersService.updateProfile({ avatarUrl: url });
      await reloadProfile();
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Account</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Manage your profile, privacy, security and how QUITIN looks for you.
          </p>
        </div>
      </div>

      <div className="sticky top-16 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface/95 p-1.5 shadow-lg shadow-black/5 backdrop-blur">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-all',
              tab === value
                ? 'bg-gradient-to-r from-accent to-accent-hover text-white shadow-md shadow-accent/25'
                : 'text-muted hover:bg-elevated hover:text-foreground',
              value === 'danger' && tab !== value && 'hover:text-danger',
            )}
          >
            {TAB_LABELS[value]}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="relative overflow-hidden border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-surface">
              <CardHeader title="Account type" />
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-lg text-accent">
                  {isCompany ? '◈' : '✦'}
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {isCompany ? 'Company' : 'Job seeker'}
                  </p>
                  <p className="text-xs text-subtle">Chosen at signup · permanent</p>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Profile picture" />
              <div className="flex flex-col items-center gap-4 text-center">
                <Avatar
                  src={profile?.profile?.avatarUrl}
                  name={form.headline || profile?.username || user.username}
                  size="lg"
                />
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={onAvatarChange}
                    disabled={uploading}
                  />
                  {uploading ? 'Uploading…' : 'Change picture'}
                </label>
                <p className="text-xs text-subtle">PNG, JPG, WEBP or GIF up to 5 MB.</p>
              </div>
            </Card>

            <Card className="border-border/60 bg-elevated/40">
              <CardHeader title="Profile tip" />
              <p className="text-sm leading-relaxed text-muted">
                {isCompany
                  ? 'Your company name, industry and hiring details help candidates find you. Open roles are managed from the Jobs page.'
                  : 'A clear headline and updated experience make it easier for companies to find the right fit.'}
              </p>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title={isCompany ? 'Company information' : 'Basic information'}
                action={
                  <span className="rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] font-medium text-subtle">
                    Public
                  </span>
                }
              />
              <div className="space-y-4">
                <Input
                  label={isCompany ? 'Company name' : 'Username'}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  hint={
                    isCompany
                      ? 'This is your public company name and profile URL.'
                      : 'This is your public @handle and profile URL.'
                  }
                  placeholder={isCompany ? 'Acme Studio' : 'alexdev'}
                />
                <Input
                  label={isCompany ? 'Tagline' : 'Headline'}
                  value={form.headline}
                  onChange={(e) => setForm({ ...form, headline: e.target.value })}
                  placeholder={isCompany ? 'We build tools developers love' : 'Full-stack Engineer'}
                />
                <Textarea
                  label={isCompany ? 'About the company' : 'Bio'}
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder={isCompany ? 'Tell candidates what you do…' : 'Tell people about yourself…'}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label={isCompany ? 'Headquarters' : 'Location'}
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder={isCompany ? 'Berlin, DE' : 'Berlin, DE'}
                  />
                  <Input
                    label="Website"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>

                {isCompany ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Input
                      label="Industry"
                      value={form.industry}
                      onChange={(e) => setForm({ ...form, industry: e.target.value })}
                      placeholder="Software"
                    />
                    <Input
                      label="Team size"
                      value={form.companySize}
                      onChange={(e) => setForm({ ...form, companySize: e.target.value })}
                      placeholder="11-50"
                    />
                    <Input
                      label="Founded"
                      value={form.foundedYear}
                      onChange={(e) => setForm({ ...form, foundedYear: e.target.value })}
                      placeholder="2019"
                    />
                  </div>
                ) : (
                  <>
                    <Input
                      label="Current company"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      placeholder="Acme Inc."
                    />
                    <Input
                      label="Skills"
                      value={form.skills}
                      onChange={(e) => setForm({ ...form, skills: e.target.value })}
                      hint="Separate skills with commas."
                      placeholder="TypeScript, React, Node.js"
                    />
                  </>
                )}

                <div className="flex justify-end border-t border-border pt-4">
                  <Button onClick={() => void saveProfile()} loading={saving}>
                    Save changes
                  </Button>
                </div>
              </div>
            </Card>

            {isCompany ? (
              <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-surface">
                <CardHeader title="Company profile" />
                <p className="text-sm leading-relaxed text-muted">
                  Company accounts use hiring details instead of education and work experience. Your
                  industry, team size, founded year and open roles are shown to candidates.
                </p>
              </Card>
            ) : (
              <>
                <ExperienceSection experiences={profile?.profile?.experiences ?? []} onChange={reloadProfile} />
                <EducationSection educations={profile?.profile?.educations ?? []} onChange={reloadProfile} />
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'privacy' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Who can see and contact you"
              action={
                <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
                  {privacy.visibility === 'PUBLIC' ? 'Open profile' : 'Private profile'}
                </span>
              }
            />
            <div className="space-y-5">
              <ChoiceGroup
                label="Profile visibility"
                value={privacy.visibility}
                onChange={(value) => setPrivacy({ ...privacy, visibility: value as 'PUBLIC' | 'PRIVATE' })}
                options={[
                  { value: 'PUBLIC', title: 'Public', description: 'Anyone can view your profile.' },
                  { value: 'PRIVATE', title: 'Private', description: 'Only people you follow can view it.' },
                ]}
              />
              <ChoiceGroup
                label="Who can message you"
                value={privacy.messagingPermission}
                onChange={(value) =>
                  setPrivacy({ ...privacy, messagingPermission: value as 'EVERYONE' | 'FOLLOWERS' })
                }
                options={[
                  { value: 'EVERYONE', title: 'Everyone', description: 'Anyone can start a conversation.' },
                  { value: 'FOLLOWERS', title: 'Followers only', description: 'Only followers can message you.' },
                ]}
              />
              <div className="flex justify-end border-t border-border pt-4">
                <Button onClick={() => void savePrivacy()} loading={privacySaving}>
                  Save privacy settings
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Blocked users"
                action={
                  <span className="rounded-full bg-elevated px-2.5 py-1 text-[11px] font-medium text-subtle">
                    {blockedUsers.length}
                  </span>
                }
              />
              {blockedUsers.length === 0 ? (
                <EmptyState icon="◎" text="You have not blocked anyone." />
              ) : (
                <ul className="space-y-2">
                  {blockedUsers.map((blocked) => (
                    <li
                      key={blocked.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar src={blocked.profile?.avatarUrl} name={blocked.username} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">@{blocked.username}</p>
                          <p className="truncate text-xs text-subtle">
                            {blocked.lastActiveAt
                              ? `Blocked ${new Date(blocked.lastActiveAt).toLocaleDateString()}`
                              : 'Blocked'}
                          </p>
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => void unblock(blocked.username)}>
                        Unblock
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Follow requests"
                action={
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
                    {followRequests.length} pending
                  </span>
                }
              />
              {followRequests.length === 0 ? (
                <EmptyState icon="✦" text="No pending follow requests." />
              ) : (
                <ul className="space-y-2">
                  {followRequests.map((request) => (
                    <li
                      key={request.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar
                          src={request.user.profile?.avatarUrl}
                          name={request.user.username}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            @{request.user.username}
                          </p>
                          <p className="text-xs text-subtle">
                            Requested{' '}
                            {new Date(request.user.createdAt ?? Date.now()).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" onClick={() => void acceptFollowRequest(request.id)}>
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void rejectFollowRequest(request.id)}
                        >
                          Decline
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Change password" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                }
              />
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              />
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                }
              />
            </div>
            <div className="mt-4 flex justify-end border-t border-border pt-4">
              <Button onClick={() => void changePassword()} loading={changingPassword}>
                Update password
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Email address"
              action={
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium',
                    user.emailVerifiedAt
                      ? 'bg-success/10 text-success'
                      : 'bg-amber-500/10 text-amber-500',
                  )}
                >
                  {user.emailVerifiedAt ? 'Verified' : 'Pending'}
                </span>
              }
            />
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-elevated px-4 py-3">
                <p className="text-xs text-subtle">Current email</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">{user.email ?? 'Not set'}</p>
                {user.pendingEmail && (
                  <p className="mt-2 text-xs text-accent">
                    Waiting for verification: <span className="font-medium">{user.pendingEmail}</span>
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="New email address"
                  type="email"
                  autoComplete="email"
                  value={emailForm.email}
                  onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })}
                  placeholder="you@example.com"
                />
                <Input
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  value={emailForm.currentPassword}
                  onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })}
                  placeholder="Required to confirm it is you"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="secondary"
                  onClick={() => void resendVerification()}
                  loading={resendingVerification}
                >
                  Resend verification
                </Button>
                <Button onClick={() => void changeEmail()} loading={emailBusy}>
                  Change email
                </Button>
              </div>
            </div>
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Session</p>
              <p className="mt-1 text-xs text-subtle">Sign out of this device. You can log back in anytime.</p>
            </div>
            <Button variant="secondary" onClick={() => void logout()}>
              Log out
            </Button>
          </Card>
        </div>
      )}

      {tab === 'appearance' && (
        <Card>
          <CardHeader title="Appearance" />
          <p className="mb-4 text-sm text-muted">
            Choose how QUITIN looks. Your choice is saved on this device and follows both the dark
            and light themes.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['dark', 'light'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  applyTheme(value);
                  setThemeState(value);
                }}
                aria-pressed={theme === value}
                className={cn(
                  'group rounded-xl border p-4 text-left transition-all',
                  theme === value
                    ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10'
                    : 'border-border bg-elevated hover:border-strong',
                )}
              >
                <div
                  className={cn(
                    'mb-3 h-24 overflow-hidden rounded-lg border p-3',
                    value === 'dark'
                      ? 'border-zinc-700 bg-zinc-950'
                      : 'border-zinc-200 bg-zinc-50',
                  )}
                >
                  <div
                    className={cn(
                      'h-3 w-16 rounded-full',
                      value === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300',
                    )}
                  />
                  <div
                    className={cn(
                      'mt-2 h-2 w-24 rounded-full',
                      value === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200',
                    )}
                  />
                  <div className="mt-4 h-6 w-20 rounded-md bg-accent" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold capitalize text-foreground">{value}</span>
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border text-[10px]',
                      theme === value
                        ? 'border-accent bg-accent text-white'
                        : 'border-border text-transparent',
                    )}
                  >
                    ✓
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === 'danger' && (
        <Card className="border-danger/30 bg-gradient-to-br from-danger/5 to-surface">
          <CardHeader title="Delete account" />
          <p className="text-sm leading-relaxed text-muted">
            This permanently removes your profile, posts, comments, messages and job activity. This
            action cannot be undone.
          </p>
          <div className="mt-5 flex justify-end">
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete account
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete account"
        description="This permanently deletes your QUITIN profile, posts, comments and messages."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteBusy}
              disabled={!deletePassword}
              onClick={() => void deleteAccount()}
            >
              Confirm deletion
            </Button>
          </>
        }
      >
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          placeholder="Enter your password to confirm"
        />
      </Modal>
    </div>
  );
}

function ChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; title: string; description: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-xl border px-4 py-3 text-left transition-all',
              value === option.value
                ? 'border-accent bg-accent/10 shadow-sm shadow-accent/10'
                : 'border-border bg-elevated hover:border-strong',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{option.title}</span>
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full border text-[9px]',
                  value === option.value
                    ? 'border-accent bg-accent text-white'
                    : 'border-strong text-transparent',
                )}
              >
                ✓
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-subtle">{option.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-elevated/40 px-4 py-8 text-center">
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-lg text-accent">
        {icon}
      </span>
      <p className="text-sm text-subtle">{text}</p>
    </div>
  );
}

interface ExperienceDraft {
  title: string;
  company: string;
  location: string;
  description: string;
  startDate: string;
  endDate: string;
  current: boolean;
}

const EMPTY_EXPERIENCE: ExperienceDraft = {
  title: '',
  company: '',
  location: '',
  description: '',
  startDate: '',
  endDate: '',
  current: false,
};

function ExperienceSection({
  experiences,
  onChange,
}: {
  experiences: Experience[];
  onChange: () => Promise<void>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ExperienceDraft>(EMPTY_EXPERIENCE);

  function reset() {
    setDraft(EMPTY_EXPERIENCE);
    setEditingId(null);
    setOpen(false);
  }

  function startEdit(exp: Experience) {
    setEditingId(exp.id);
    setOpen(true);
    setDraft({
      title: exp.title,
      company: exp.company,
      location: exp.location ?? '',
      description: exp.description ?? '',
      startDate: exp.startDate?.slice(0, 10) ?? '',
      endDate: exp.endDate?.slice(0, 10) ?? '',
      current: exp.current,
    });
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        title: draft.title,
        company: draft.company,
        location: draft.location || undefined,
        description: draft.description || undefined,
        startDate: draft.startDate ? new Date(draft.startDate).toISOString() : undefined,
        endDate: draft.endDate ? new Date(draft.endDate).toISOString() : undefined,
        current: draft.current,
      };
      if (editingId) {
        await usersService.updateExperience(editingId, payload);
        toast.success('Experience updated');
      } else {
        await usersService.addExperience(payload);
        toast.success('Experience added');
      }
      reset();
      await onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save experience.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await usersService.deleteExperience(id);
      toast.success('Experience removed');
      await onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove experience.');
    }
  }

  return (
    <Card>
      <CardHeader
        title="Experience"
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (open) reset();
              else setOpen(true);
            }}
          >
            {open ? 'Cancel' : 'Add'}
          </Button>
        }
      />
      {experiences.length === 0 && !open && <EmptyState icon="▤" text="No experience added yet." />}
      <ul className="space-y-2">
        {experiences.map((exp) => (
          <li
            key={exp.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{exp.title}</p>
              <p className="text-xs text-subtle">{exp.company}</p>
              <p className="text-xs text-subtle">
                {formatMonthYear(exp.startDate)} – {exp.current ? 'Present' : formatMonthYear(exp.endDate)}
              </p>
            </div>
            <div className="flex shrink-0 gap-3 text-xs">
              <button type="button" onClick={() => startEdit(exp)} className="text-accent hover:underline">
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove(exp.id)}
                className="text-subtle hover:text-danger"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Input
              label="Company"
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            />
          </div>
          <Input
            label="Location"
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Start date"
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
            <Input
              label="End date"
              type="date"
              value={draft.endDate}
              disabled={draft.current}
              onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={draft.current}
              onChange={(e) => setDraft({ ...draft, current: e.target.checked })}
              className="h-4 w-4 rounded border-border bg-elevated accent-accent"
            />
            I currently work here
          </label>
          <Textarea
            label="Description"
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <div className="flex justify-end">
            <Button onClick={() => void save()} loading={busy} disabled={!draft.title || !draft.company}>
              {editingId ? 'Save changes' : 'Add experience'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

interface EducationDraft {
  school: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
}

const EMPTY_EDUCATION: EducationDraft = {
  school: '',
  degree: '',
  fieldOfStudy: '',
  startDate: '',
  endDate: '',
};

function EducationSection({
  educations,
  onChange,
}: {
  educations: Education[];
  onChange: () => Promise<void>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<EducationDraft>(EMPTY_EDUCATION);

  function reset() {
    setDraft(EMPTY_EDUCATION);
    setEditingId(null);
    setOpen(false);
  }

  function startEdit(edu: Education) {
    setEditingId(edu.id);
    setOpen(true);
    setDraft({
      school: edu.school,
      degree: edu.degree ?? '',
      fieldOfStudy: edu.fieldOfStudy ?? '',
      startDate: edu.startDate?.slice(0, 10) ?? '',
      endDate: edu.endDate?.slice(0, 10) ?? '',
    });
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        school: draft.school,
        degree: draft.degree || undefined,
        fieldOfStudy: draft.fieldOfStudy || undefined,
        startDate: draft.startDate ? new Date(draft.startDate).toISOString() : undefined,
        endDate: draft.endDate ? new Date(draft.endDate).toISOString() : undefined,
      };
      if (editingId) {
        await usersService.updateEducation(editingId, payload);
        toast.success('Education updated');
      } else {
        await usersService.addEducation(payload);
        toast.success('Education added');
      }
      reset();
      await onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save education.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await usersService.deleteEducation(id);
      toast.success('Education removed');
      await onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove education.');
    }
  }

  return (
    <Card>
      <CardHeader
        title="Education"
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (open) reset();
              else setOpen(true);
            }}
          >
            {open ? 'Cancel' : 'Add'}
          </Button>
        }
      />
      {educations.length === 0 && !open && <EmptyState icon="⌘" text="No education added yet." />}
      <ul className="space-y-2">
        {educations.map((edu) => (
          <li
            key={edu.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border bg-elevated px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{edu.school}</p>
              <p className="text-xs text-subtle">
                {[edu.degree, edu.fieldOfStudy].filter(Boolean).join(', ')}
              </p>
              <p className="text-xs text-subtle">
                {formatMonthYear(edu.startDate)} – {formatMonthYear(edu.endDate)}
              </p>
            </div>
            <div className="flex shrink-0 gap-3 text-xs">
              <button type="button" onClick={() => startEdit(edu)} className="text-accent hover:underline">
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove(edu.id)}
                className="text-subtle hover:text-danger"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Input
            label="School"
            value={draft.school}
            onChange={(e) => setDraft({ ...draft, school: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Degree"
              value={draft.degree}
              onChange={(e) => setDraft({ ...draft, degree: e.target.value })}
            />
            <Input
              label="Field of study"
              value={draft.fieldOfStudy}
              onChange={(e) => setDraft({ ...draft, fieldOfStudy: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Start date"
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
            <Input
              label="End date"
              type="date"
              value={draft.endDate}
              onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} loading={busy} disabled={!draft.school}>
              {editingId ? 'Save changes' : 'Add education'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
