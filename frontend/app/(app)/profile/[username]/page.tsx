'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Spinner } from '@/components/ui/Feedback';
import { Card, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Input';
import { UserActionsMenu } from '@/components/users/UserActionsMenu';
import { useToast } from '@/components/ui/Toast';
import { PostCard } from '@/components/feed/PostCard';
import { FollowButton } from '@/components/users/FollowButton';
import { UserCard } from '@/components/users/UserCard';
import { postsService, usersService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { formatMonthYear } from '@/lib/utils';
import type { Post, User } from '@/types';

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;
  const router = useRouter();
  const toast = useToast();
  const { user: me } = useAuth();

  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [connections, setConnections] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<'posts' | 'about' | 'followers' | 'following'>('posts');


  const isSelf = me?.username === username;

  useEffect(() => {
    if (!isSelf && (tab === 'followers' || tab === 'following')) setTab('posts');
  }, [isSelf, tab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, postsRes] = await Promise.all([
        usersService.getProfile(username),
        postsService.feed({ username, take: 30 }),
      ]);
      setProfile(profileRes);
      setPosts(postsRes.posts);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isSelf || (tab !== 'followers' && tab !== 'following')) return;
    let active = true;
    setConnectionsLoading(true);
    const request = tab === 'followers' ? usersService.followers : usersService.following;
    request(username)
      .then((res) => {
        if (active) {
          setConnections(
            tab === 'following'
              ? res.users.map((connection) => ({ ...connection, isFollowing: true }))
              : res.users,
          );
        }
      })
      .catch(() => {
        if (active) setConnections([]);
      })
      .finally(() => {
        if (active) setConnectionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isSelf, tab, username]);

  function setBlocked(block: boolean) {
    setProfile((current) =>
      current
        ? {
            ...current,
            isBlockedByMe: block,
            isFollowing: false,
            canMessage: !block,
          }
        : current,
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <EmptyState
        title="User not found"
        description="This profile does not exist or may have been removed."
      />
    );
  }

  const displayName = profile.profile?.headline || profile.username;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <Card className="overflow-hidden p-0">
          <div className="h-28 border-b border-border bg-elevated" />
          <div className="px-5 pb-5">
            <div className="-mt-10 flex items-end justify-between">
              <Avatar
                src={profile.profile?.avatarUrl}
                name={displayName}
                size="xl"
                className="ring-4 ring-surface"
              />
              {isSelf ? (
                <Button variant="secondary" size="sm" onClick={() => router.push('/settings')}>
                  Edit profile
                </Button>
              ) : profile.hasBlockedMe ? (
                <Button variant="secondary" size="md" disabled>
                  Profile unavailable
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  {!profile.isBlockedByMe && (
                    <>
                      <Button
                        variant="secondary"
                        size="md"
                        disabled={profile.canMessage === false}
                        onClick={() =>
                          router.push(`/messages?to=${encodeURIComponent(profile.username)}`)
                        }
                      >
                        Message
                      </Button>
                      <FollowButton
                        username={profile.username}
                        initialFollowing={!!profile.isFollowing}
                        initialRequested={!!profile.isRequested}
                        size="md"
                        onChange={(state) =>
                          setProfile((current) => {
                            if (!current) return current;
                            const wasFollowing = !!current.isFollowing;
                            const followerDelta =
                              Number(state.following) - Number(wasFollowing);
                            return {
                              ...current,
                              isFollowing: state.following,
                              isRequested: state.requested,
                              _count: current._count
                                ? {
                                    ...current._count,
                                    followers: Math.max(
                                      0,
                                      current._count.followers + followerDelta,
                                    ),
                                  }
                                : current._count,
                            };
                          })
                        }
                      />
                    </>
                  )}
                  <UserActionsMenu
                    username={profile.username}
                    blocked={!!profile.isBlockedByMe}
                    onBlockChanged={setBlocked}
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
                <Badge className="text-xs">
                  {profile.role === 'COMPANY' ? 'Company' : 'Job seeker'}
                </Badge>
              </div>
              <p className="text-sm text-subtle">@{profile.username}</p>
              {profile.profile?.bio && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {profile.profile.bio}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
                {profile.profile?.location && <span>{profile.profile.location}</span>}
                {profile.profile?.company && <span>{profile.profile.company}</span>}
                {profile.profile?.website && (
                  <a
                    href={profile.profile.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent hover:underline"
                  >
                    {profile.profile.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-5 text-sm">
                {isSelf ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setTab('followers')}
                      className="text-muted hover:text-foreground"
                    >
                      <strong className="text-foreground">{profile._count?.followers ?? 0}</strong>{' '}
                      followers
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('following')}
                      className="text-muted hover:text-foreground"
                    >
                      <strong className="text-foreground">{profile._count?.following ?? 0}</strong>{' '}
                      following
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-muted">
                      <strong className="text-foreground">{profile._count?.followers ?? 0}</strong>{' '}
                      followers
                    </span>
                    <span className="text-muted">
                      <strong className="text-foreground">{profile._count?.following ?? 0}</strong>{' '}
                      following
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setTab('posts')}
                  className="text-muted hover:text-foreground"
                >
                  <strong className="text-foreground">{profile._count?.posts ?? 0}</strong> posts
                </button>
              </div>

              {!isSelf && !profile.isFollowing && profile.profile?.visibility === 'PRIVATE' && (
                <div className="mt-4 rounded-xl border border-border bg-elevated px-4 py-3 text-sm text-muted">
                  This profile is private. Only approved followers can see their posts.
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="flex gap-1 border-b border-border">
          {(isSelf
            ? (['posts', 'about', 'followers', 'following'] as const)
            : (['posts', 'about'] as const)
          ).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === value
                  ? 'border-accent text-foreground'
                  : 'border-transparent text-subtle hover:text-foreground'
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        {tab === 'posts' ? (
          posts.length === 0 ? (
            <EmptyState title="No posts yet" description={`@${profile.username} hasn't posted anything.`} />
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
              />
            ))
          )
        ) : tab === 'about' ? (
          <AboutSection profile={profile} isSelf={isSelf} />
        ) : connectionsLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : connections.length === 0 ? (
          <EmptyState
            title={tab === 'followers' ? 'No followers yet' : 'Not following anyone'}
            description={`@${profile.username} has no ${tab} yet.`}
          />
        ) : (
          <Card>
            <CardHeader title={tab === 'followers' ? 'Followers' : 'Following'} />
            <div className="space-y-2">
              {connections.map((connection) => (
                <UserCard
                  key={connection.id}
                  user={connection}
                  currentUsername={me?.username}
                  followLabel={tab === 'followers' ? 'Follow back' : undefined}
                  followingLabel="Unfollow"
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          <Card>
            <CardHeader title="Skills" />
            {profile.profile?.skills && profile.profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.profile.skills.map((skill) => (
                  <Badge key={skill.id}>{skill.name}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-subtle">No skills added yet.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Experience" />
            {profile.profile?.experiences && profile.profile.experiences.length > 0 ? (
              <ul className="space-y-4">
                {profile.profile.experiences.map((exp) => (
                  <li key={exp.id}>
                    <p className="text-sm font-medium text-foreground">{exp.title}</p>
                    <p className="text-xs text-subtle">{exp.company}</p>
                    <p className="text-xs text-subtle">
                      {formatMonthYear(exp.startDate)} –{' '}
                      {exp.current ? 'Present' : formatMonthYear(exp.endDate)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">No experience added yet.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Education" />
            {profile.profile?.educations && profile.profile.educations.length > 0 ? (
              <ul className="space-y-4">
                {profile.profile.educations.map((edu) => (
                  <li key={edu.id}>
                    <p className="text-sm font-medium text-foreground">{edu.school}</p>
                    <p className="text-xs text-subtle">
                      {[edu.degree, edu.fieldOfStudy].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-xs text-subtle">
                      {formatMonthYear(edu.startDate)} – {formatMonthYear(edu.endDate)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">No education added yet.</p>
            )}
          </Card>
        </div>
      </aside>
    </div>
  );
}

function AboutSection({ profile, isSelf }: { profile: User; isSelf: boolean }) {
  const toast = useToast();
  const [bio, setBio] = useState(profile.profile?.bio ?? '');
  const [saving, setSaving] = useState(false);

  async function saveBio() {
    setSaving(true);
    try {
      await usersService.updateProfile({ bio });
      toast.success('About updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the about');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Bio" />
        {isSelf ? (
          <div className="space-y-3">
            <Textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Tell your network about yourself…"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void saveBio()} loading={saving} disabled={!bio.trim()}>
                Save changes
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {profile.profile?.bio || 'No bio added yet.'}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Skills" />
        {profile.profile?.skills && profile.profile.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {profile.profile.skills.map((skill) => (
              <Badge key={skill.id}>{skill.name}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-subtle">No skills added yet.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Experience" />
        {profile.profile?.experiences && profile.profile.experiences.length > 0 ? (
          <ul className="space-y-4">
            {profile.profile.experiences.map((exp) => (
              <li key={exp.id} className="border-l-2 border-border pl-4">
                <p className="text-sm font-medium text-foreground">{exp.title}</p>
                <p className="text-xs text-subtle">
                  {exp.company}
                  {exp.location ? ` · ${exp.location}` : ''}
                </p>
                <p className="text-xs text-subtle">
                  {formatMonthYear(exp.startDate)} –{' '}
                  {exp.current ? 'Present' : formatMonthYear(exp.endDate)}
                </p>
                {exp.description && (
                  <p className="mt-1 text-sm text-muted">{exp.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-subtle">No experience added yet.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Education" />
        {profile.profile?.educations && profile.profile.educations.length > 0 ? (
          <ul className="space-y-4">
            {profile.profile.educations.map((edu) => (
              <li key={edu.id} className="border-l-2 border-border pl-4">
                <p className="text-sm font-medium text-foreground">{edu.school}</p>
                <p className="text-xs text-subtle">
                  {[edu.degree, edu.fieldOfStudy].filter(Boolean).join(', ')}
                </p>
                <p className="text-xs text-subtle">
                  {formatMonthYear(edu.startDate)} – {formatMonthYear(edu.endDate)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-subtle">No education added yet.</p>
        )}
      </Card>
    </div>
  );
}
