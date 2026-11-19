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

  const [profile, setProfile] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>('dark');

  const [form, setForm] = useState({
    headline: '',
    bio: '',
    location: '',
    company: '',
    website: '',
    skills: '',
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
  const [resendingVerification, setResendingVerification] = useState(false);

  useEffect(() => {
    setThemeState(getTheme());
    const sync = () => setThemeState(getTheme());
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const full = await usersService.getProfile(user.username);
        setProfile(full);
        setForm({
          headline: full.profile?.headline ?? '',
          bio: full.profile?.bio ?? '',
          location: full.profile?.location ?? '',
          company: full.profile?.company ?? '',
          website: full.profile?.website ?? '',
          skills: (full.profile?.skills ?? []).map((s) => s.name).join(', '),
        });
        setPrivacy({
          visibility: full.profile?.visibility ?? 'PUBLIC',
          messagingPermission: full.profile?.messagingPermission ?? 'EVERYONE',
        });
      } catch {
        setError('Could not load your profile.');
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
  }, [user]);

  async function reloadProfile() {
    if (!user) return;
    const full = await usersService.getProfile(user.username);
    setProfile(full);
    await refresh();
  }

  async function saveProfile() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await usersService.updateProfile({
        headline: form.headline || undefined,
        bio: form.bio || undefined,
        location: form.location || undefined,
        company: form.company || undefined,
        website: form.website || undefined,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      await reloadProfile();
      setMessage('Profile updated.');
      toast.success('Profile updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function savePrivacy() {
    if (!user) return;
    setPrivacySaving(true);
    setError(null);
    try {
      await usersService.updateProfile({
        visibility: privacy.visibility,
        messagingPermission: privacy.messagingPermission,
      });
      await reloadProfile();
      setMessage('Privacy settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save privacy settings.');
    } finally {
      setPrivacySaving(false);
    }
  }

  async function unblock(username: string) {
    try {
      await usersService.unblock(username);
      const blocked = await usersService.blocked();
      setBlockedUsers(blocked.users);
      toast.success(`Unblocked ${username}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not unblock user');
    }
  }

  async function acceptFollowRequest(id: string) {
    try {
      const result = await usersService.acceptFollowRequest(id);
      setFollowRequests((prev) => prev.filter((entry) => entry.id !== id));
      toast.success(result.success ? 'Follow request accepted' : 'Follow request updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept follow request');
    }
  }

  async function rejectFollowRequest(id: string) {
    try {
      const result = await usersService.rejectFollowRequest(id);
      setFollowRequests((prev) => prev.filter((entry) => entry.id !== id));
      toast.success(result.success ? 'Follow request declined' : 'Follow request updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline follow request');
    }
  }

  async function changePassword() {
    if (passwordForm.newPassword.length < 8) {
      setError('Use at least 8 characters for the new password');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setChangingPassword(true);
    setError(null);
    try {
      const result = await authService.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword,
      );
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed');
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
      return;
    } finally {
      setChangingPassword(false);
    }
  }

  async function resendVerification() {
    setResendingVerification(true);
    try {
      const result = await authService.resendVerification();
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
      setError(err instanceof Error ? err.message : 'Could not delete account');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadService.avatar(file);
      await usersService.updateProfile({ avatarUrl: url });
      await reloadProfile();
      setMessage('Profile picture updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-foreground">Settings</h1>

      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={
              tab === value
                ? 'rounded-lg bg-elevated px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors'
                : 'rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground'
            }
          >
            {value === 'profile'
              ? 'Profile'
              : value === 'privacy'
                ? 'Privacy'
                : value === 'security'
                  ? 'Security'
                  : value === 'appearance'
                    ? 'Appearance'
                    : 'Danger zone'}
          </button>
        ))}
      </div>

      {(message || error) && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            error
              ? 'border-red-500/30 bg-red-500/10 text-danger'
              : 'border-emerald-500/30 bg-emerald-500/10 text-success'
          }`}
        >
          {error ?? message}
        </div>
      )}

      {tab === 'privacy' && (
        <>
          <Card>
            <CardHeader title="Who can see and contact you" />
            <div className="space-y-4">
              <div>
                <label htmlFor="profile-visibility" className="mb-1.5 block text-sm font-medium text-foreground">
                  Profile visibility
                </label>
                <select
                  id="profile-visibility"
                  value={privacy.visibility}
                  onChange={(e) =>
                    setPrivacy({ ...privacy, visibility: e.target.value as 'PUBLIC' | 'PRIVATE' })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
                >
                  <option value="PUBLIC">Public — anyone can see your profile</option>
                  <option value="PRIVATE">Private — only people you follow can see it</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="messaging-permission"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Who can message you
                </label>
                <select
                  id="messaging-permission"
                  value={privacy.messagingPermission}
                  onChange={(e) =>
                    setPrivacy({
                      ...privacy,
                      messagingPermission: e.target.value as 'EVERYONE' | 'FOLLOWERS',
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
                >
                  <option value="EVERYONE">Everyone — anyone can start a conversation</option>
                  <option value="FOLLOWERS">Followers only — only people who follow you</option>
                </select>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => void savePrivacy()} loading={privacySaving}>
                  Save privacy settings
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Blocked users" />
            {blockedUsers.length === 0 ? (
              <p className="text-sm text-subtle">You have not blocked anyone.</p>
            ) : (
              <ul className="space-y-2">
                {blockedUsers.map((blocked) => (
                  <li
                    key={blocked.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">@{blocked.username}</p>
                      <p className="truncate text-xs text-subtle">
                        Blocked {blocked.lastActiveAt ? new Date(blocked.lastActiveAt).toLocaleDateString() : ''}
                      </p>
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
            <CardHeader title="Follow requests" />
            {followRequests.length === 0 ? (
              <p className="text-sm text-subtle">No pending follow requests.</p>
            ) : (
              <ul className="space-y-2">
                {followRequests.map((request) => (
                  <li
                    key={request.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        @{request.user.username}
                      </p>
                      <p className="text-xs text-subtle">
                        Requested {new Date(request.user.createdAt ?? Date.now()).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void acceptFollowRequest(request.id)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void rejectFollowRequest(request.id)}>
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {tab === 'security' && (
        <>
          <Card>
            <CardHeader title="Change password" />
            <div className="space-y-4">
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
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
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />
              <div className="flex justify-end">
                <Button onClick={() => void changePassword()} loading={changingPassword}>
                  Update password
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Email" />
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Your email address is{' '}
                <span className="font-medium text-foreground">{user.email ?? 'not set'}</span>
                {user.emailVerifiedAt ? (
                  <span className="ml-1 text-emerald-500">Verified</span>
                ) : (
                  <span className="ml-1 text-amber-500">Pending</span>
                )}
              </p>
              <div className="flex justify-end">
                <Button onClick={() => void resendVerification()} loading={resendingVerification}>
                  Resend verification email
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {tab === 'appearance' && (
        <Card>
          <CardHeader title="Appearance" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-foreground">Theme</p>
              <p className="mt-1 text-xs text-subtle">
                Choose how QUITIN looks. Your choice is saved on this device.
              </p>
            </div>
            <div className="flex gap-1 rounded-lg border border-border bg-elevated p-1">
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
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    theme === value
                      ? 'bg-surface text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted hover:text-foreground',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {tab === 'danger' && (
        <Card>
          <CardHeader
            title="Delete account"
            action={
              <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
                Delete account
              </Button>
            }
          />
          <p className="text-sm text-muted">
            Deleting your account permanently removes your profile, posts, comments and messages.
            This action cannot be undone.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setDeleteOpen(true)} className="bg-red-600 hover:bg-red-700">
              Delete account
            </Button>
          </div>
        </Card>
      )}

      {tab === 'profile' && (
        <>
          <Card>
            <CardHeader title="Account role" />
            <p className="text-sm text-foreground">
              {user.role === 'COMPANY' ? 'Company' : 'Job seeker'}
            </p>
            <p className="mt-1 text-xs text-subtle">
              Your account type is chosen at signup and cannot be changed.
            </p>
          </Card>

          <Card>
            <CardHeader title="Profile picture" />
            <div className="flex items-center gap-4">
              <Avatar src={profile?.profile?.avatarUrl} name={form.headline || user.username} size="lg" />
              <div>
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground hover:bg-elevated-hover">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={onAvatarChange}
                    disabled={uploading}
                  />
                  {uploading ? 'Uploading…' : 'Upload new picture'}
                </label>
                <p className="mt-1.5 text-xs text-subtle">PNG, JPG, WEBP or GIF up to 5 MB.</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Basic information" />
            <div className="space-y-4">
              <Input
                label="Headline"
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                placeholder="Full-stack Engineer"
              />
              <Textarea
                label="Bio"
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Tell people about yourself…"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Berlin, DE"
                />
                <Input
                  label="Company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Acme Inc."
                />
              </div>
              <Input
                label="Website"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://example.com"
              />
              <Input
                label="Skills"
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                hint="Separate skills with commas."
                placeholder="TypeScript, React, Node.js"
              />
              <div className="flex justify-end">
                <Button onClick={() => void saveProfile()} loading={saving}>
                  Save changes
                </Button>
              </div>
            </div>
          </Card>

          <ExperienceSection
            experiences={profile?.profile?.experiences ?? []}
            onChange={reloadProfile}
            onError={setError}
          />

          <EducationSection
            educations={profile?.profile?.educations ?? []}
            onChange={reloadProfile}
            onError={setError}
          />
        </>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => void logout()}>
          Log out
        </Button>
      </div>

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
            <Button variant="danger" loading={deleteBusy} onClick={() => void deleteAccount()}>
              Delete everything
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Enter your password to confirm"
          />
          <Button
            variant="danger"
            className="w-full"
            loading={deleteBusy}
            disabled={!deletePassword}
            onClick={() => void deleteAccount()}
          >
            Delete permanently
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ExperienceSection({
  experiences,
  onChange,
  onError,
}: {
  experiences: Experience[];
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    company: '',
    location: '',
    description: '',
    startDate: '',
    endDate: '',
    current: false,
  });

  async function add() {
    setBusy(true);
    try {
      await usersService.addExperience({
        title: draft.title,
        company: draft.company,
        location: draft.location || undefined,
        description: draft.description || undefined,
        startDate: draft.startDate ? new Date(draft.startDate).toISOString() : undefined,
        endDate: draft.endDate ? new Date(draft.endDate).toISOString() : undefined,
        current: draft.current,
      });
      setDraft({
        title: '',
        company: '',
        location: '',
        description: '',
        startDate: '',
        endDate: '',
        current: false,
      });
      setOpen(false);
      await onChange();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not add experience.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await usersService.deleteExperience(id).catch(() => undefined);
    await onChange();
  }

  return (
    <Card>
      <CardHeader
        title="Experience"
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : 'Add'}
          </Button>
        }
      />

      {experiences.length === 0 && !open && (
        <p className="text-sm text-subtle">No experience added yet.</p>
      )}

      <ul className="space-y-3">
        {experiences.map((exp) => (
          <li
            key={exp.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{exp.title}</p>
              <p className="text-xs text-subtle">{exp.company}</p>
              <p className="text-xs text-subtle">
                {formatMonthYear(exp.startDate)} – {exp.current ? 'Present' : formatMonthYear(exp.endDate)}
              </p>
            </div>
            <button onClick={() => void remove(exp.id)} className="text-xs text-subtle hover:text-danger">
              Remove
            </button>
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
            <Button onClick={() => void add()} loading={busy} disabled={!draft.title || !draft.company}>
              Add experience
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function EducationSection({
  educations,
  onChange,
  onError,
}: {
  educations: Education[];
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    school: '',
    degree: '',
    fieldOfStudy: '',
    startDate: '',
    endDate: '',
  });

  async function add() {
    setBusy(true);
    try {
      await usersService.addEducation({
        school: draft.school,
        degree: draft.degree || undefined,
        fieldOfStudy: draft.fieldOfStudy || undefined,
        startDate: draft.startDate ? new Date(draft.startDate).toISOString() : undefined,
        endDate: draft.endDate ? new Date(draft.endDate).toISOString() : undefined,
      });
      setDraft({ school: '', degree: '', fieldOfStudy: '', startDate: '', endDate: '' });
      setOpen(false);
      await onChange();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not add education.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await usersService.deleteEducation(id).catch(() => undefined);
    await onChange();
  }

  return (
    <Card>
      <CardHeader
        title="Education"
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Cancel' : 'Add'}
          </Button>
        }
      />

      {educations.length === 0 && !open && (
        <p className="text-sm text-subtle">No education added yet.</p>
      )}

      <ul className="space-y-3">
        {educations.map((edu) => (
          <li
            key={edu.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5"
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
            <button onClick={() => void remove(edu.id)} className="text-xs text-subtle hover:text-danger">
              Remove
            </button>
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
            <Button onClick={() => void add()} loading={busy} disabled={!draft.school}>
              Add education
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
