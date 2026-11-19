'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, EmptyState, Spinner } from '@/components/ui/Feedback';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  APPLICATION_LABELS,
  JOB_TYPE_LABELS,
  salaryLabel,
} from '@/components/jobs/JobCard';
import { useAuth } from '@/hooks/useAuth';
import { jobsService } from '@/lib/services';
import { formatMonthYear, timeAgo } from '@/lib/utils';
import type { ApplicationStatus, Job, JobApplication, JobType } from '@/types';

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [coverLetter, setCoverLetter] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    title: '',
    description: '',
    location: '',
    type: 'FULL_TIME' as JobType,
    salaryMin: '',
    salaryMax: '',
  });
  const [applicants, setApplicants] = useState<JobApplication[]>([]);
  const [applicantFilter, setApplicantFilter] = useState<ApplicationStatus | ''>('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [recruiting, setRecruiting] = useState<{
    applicationId: string;
    username: string;
    kind: 'interview' | 'offer';
  } | null>(null);
  const [recruitMessage, setRecruitMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const isOwner = Boolean(job && user && job.company.id === user.id);
  const myApplication = job?.myApplication ?? job?.applications?.[0] ?? null;

  const loadApplicants = useCallback(async () => {
    if (!isOwner) return;
    const res = await jobsService.applicants(id, applicantFilter || undefined);
    setApplicants(res.applications);
  }, [id, isOwner, applicantFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jobsService.get(id);
      setJob(data);
      setEdit({
        title: data.title,
        description: data.description,
        location: data.location,
        type: data.type,
        salaryMin: data.salaryMin ? String(data.salaryMin) : '',
        salaryMax: data.salaryMax ? String(data.salaryMax) : '',
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadApplicants();
  }, [loadApplicants]);

  async function apply() {
    setBusy(true);
    try {
      await jobsService.apply(id, coverLetter || undefined);
      toast.success('Application submitted');
      setCoverLetter('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not apply');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      await jobsService.withdraw(id);
      toast.success('Application withdrawn');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not withdraw');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await jobsService.update(id, {
        title: edit.title,
        description: edit.description,
        location: edit.location,
        type: edit.type,
        salaryMin: edit.salaryMin ? Number(edit.salaryMin) : null,
        salaryMax: edit.salaryMax ? Number(edit.salaryMax) : null,
      });
      toast.success('Job offer updated');
      setEditing(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the job');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!job) return;
    setBusy(true);
    try {
      await jobsService.update(id, { status: job.status === 'OPEN' ? 'CLOSED' : 'OPEN' });
      toast.success(job.status === 'OPEN' ? 'Job offer closed' : 'Job offer reopened');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change status');
    } finally {
      setBusy(false);
    }
  }

  async function removeJob() {
    setBusy(true);
    try {
      await jobsService.remove(id);
      toast.success('Job offer deleted');
      router.push('/jobs');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the job');
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  async function setStatus(applicationId: string, status: ApplicationStatus) {
    try {
      await jobsService.setApplicationStatus(id, applicationId, status);
      toast.success(`Application ${status.toLowerCase()}`);
      await loadApplicants();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the application');
    }
  }

  async function sendRecruitment() {
    if (!recruiting || !recruitMessage.trim()) return;
    setBusy(true);
    try {
      if (recruiting.kind === 'interview') {
        await jobsService.inviteToInterview(id, recruiting.applicationId, {
          message: recruitMessage.trim(),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        });
        toast.success(`Interview invitation sent to @${recruiting.username}`);
      } else {
        await jobsService.sendOffer(id, recruiting.applicationId, {
          message: recruitMessage.trim(),
        });
        toast.success(`Offer sent to @${recruiting.username}`);
      }
      setRecruiting(null);
      setRecruitMessage('');
      setScheduledAt('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the update');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!job) {
    return <EmptyState title="Job not found" description="This offer may have been removed." />;
  }

  const salary = salaryLabel(job);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link href="/jobs" className="text-sm text-muted hover:text-foreground hover:underline">
        ← Back to jobs
      </Link>

      <Card>
        <div className="flex items-start gap-4">
          <Avatar
            src={job.company.profile?.avatarUrl}
            name={job.company.profile?.company || job.company.username}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-foreground">{job.title}</h1>
              <Badge className={job.status === 'OPEN' ? 'text-success' : 'text-muted'}>
                {job.status === 'OPEN' ? 'Open' : 'Closed'}
              </Badge>
            </div>
            <Link
              href={`/profile/${job.company.username}`}
              className="mt-1 block text-sm text-muted hover:text-foreground hover:underline"
            >
              {job.company.profile?.company || `@${job.company.username}`}
            </Link>
            <p className="mt-1 text-sm text-muted">
              {job.location} · Posted {formatMonthYear(job.createdAt)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{JOB_TYPE_LABELS[job.type]}</Badge>
              {salary && <Badge>{salary}</Badge>}
            </div>
          </div>
        </div>

        {!editing && (
          <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {job.description}
          </div>
        )}

        {isOwner && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel edit' : 'Edit offer'}
            </Button>
            <Button variant="secondary" size="sm" onClick={toggleStatus} loading={busy}>
              {job.status === 'OPEN' ? 'Close offer' : 'Reopen offer'}
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        )}

        {editing && isOwner && (
          <div className="mt-4 space-y-4 rounded-lg border border-border p-4">
            <Input
              name="edit-title"
              label="Job title"
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                name="edit-location"
                label="Location"
                value={edit.location}
                onChange={(e) => setEdit({ ...edit, location: e.target.value })}
              />
              <select
                value={edit.type}
                onChange={(e) => setEdit({ ...edit, type: e.target.value as JobType })}
                className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
              >
                {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                name="edit-salary-min"
                label="Minimum salary"
                type="number"
                min={0}
                value={edit.salaryMin}
                onChange={(e) => setEdit({ ...edit, salaryMin: e.target.value })}
              />
              <Input
                name="edit-salary-max"
                label="Maximum salary"
                type="number"
                min={0}
                value={edit.salaryMax}
                onChange={(e) => setEdit({ ...edit, salaryMax: e.target.value })}
              />
            </div>
            <Textarea
              name="edit-description"
              label="Description"
              rows={8}
              value={edit.description}
              onChange={(e) => setEdit({ ...edit, description: e.target.value })}
            />
            <Button onClick={saveEdit} loading={busy}>
              Save changes
            </Button>
          </div>
        )}
      </Card>

      {!isOwner && user?.role !== 'COMPANY' && (
        <Card>
          <CardHeader
            title={
              myApplication
                ? `Your application · ${APPLICATION_LABELS[myApplication.status]}`
                : 'Apply to this job'
            }
          />
          {myApplication ? (
            <div className="space-y-4">
              <ApplicationProgress status={myApplication.status} />
              <div className="flex flex-wrap gap-2">
                {myApplication.status === 'WITHDRAWN' ? (
                  job.status === 'OPEN' && (
                    <Button onClick={apply} loading={busy}>
                      Apply again
                    </Button>
                  )
                ) : (
                  <Button variant="secondary" onClick={withdraw} loading={busy}>
                    Withdraw application
                  </Button>
                )}
                <Link
                  href={`/messages?to=${encodeURIComponent(job.company.username)}`}
                  className={buttonClasses('ghost', 'md')}
                >
                  Message company
                </Link>
              </div>
            </div>
          ) : job.status === 'OPEN' ? (
            <div className="space-y-4">
              <Textarea
                name="cover-letter"
                label="Cover letter (optional)"
                rows={5}
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
              />
              <Button onClick={apply} loading={busy}>
                Submit application
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">This job offer is closed.</p>
          )}
        </Card>
      )}

      {isOwner && (
        <Card>
          <CardHeader
            title="Applicants"
            action={
              <select
                value={applicantFilter}
                onChange={(e) => setApplicantFilter(e.target.value as ApplicationStatus | '')}
                className="h-8 rounded-lg border border-border bg-elevated px-2 text-xs text-foreground"
              >
                <option value="">All</option>
                {Object.entries(APPLICATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            }
          />
          {applicants.length === 0 ? (
            <EmptyState
              title="No applicants"
              description="Applications will appear here as soon as someone applies."
            />
          ) : (
            <div className="space-y-3">
              {applicants.map((application) => (
                <div
                  key={application.id}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/profile/${application.applicant?.username}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar
                        src={application.applicant?.profile?.avatarUrl}
                        name={application.applicant?.username || '?'}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground hover:underline">
                          @{application.applicant?.username}
                        </p>
                        <p className="text-xs text-subtle">
                          Applied {timeAgo(application.createdAt)}
                        </p>
                      </div>
                    </Link>
                    <Badge>{APPLICATION_LABELS[application.status]}</Badge>
                  </div>
                  {application.coverLetter && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-muted">
                      {application.coverLetter}
                    </p>
                  )}
                  <ApplicationProgress status={application.status} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setStatus(application.id, 'ACCEPTED')}
                      disabled={application.status === 'ACCEPTED'}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setStatus(application.id, 'REJECTED')}
                      disabled={application.status === 'REJECTED'}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStatus(application.id, 'REVIEWED')}
                      disabled={application.status === 'REVIEWED'}
                    >
                      Mark reviewed
                    </Button>
                    <Link
                      href={`/messages?to=${encodeURIComponent(application.applicant?.username ?? '')}`}
                      className={buttonClasses('ghost', 'sm')}
                    >
                      Message
                    </Link>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        application.status === 'REJECTED' || application.status === 'WITHDRAWN'
                      }
                      onClick={() =>
                        setRecruiting({
                          applicationId: application.id,
                          username: application.applicant?.username ?? '',
                          kind: 'interview',
                        })
                      }
                    >
                      Invite interview
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        application.status === 'REJECTED' || application.status === 'WITHDRAWN'
                      }
                      onClick={() =>
                        setRecruiting({
                          applicationId: application.id,
                          username: application.applicant?.username ?? '',
                          kind: 'offer',
                        })
                      }
                    >
                      Send offer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={!!recruiting}
        onClose={() => setRecruiting(null)}
        title={
          recruiting?.kind === 'interview'
            ? `Invite @${recruiting.username} to an interview`
            : `Send @${recruiting?.username ?? ''} a job offer`
        }
        description="This sends a precise notification with the job title and your message."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecruiting(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!recruitMessage.trim()}
              onClick={() => void sendRecruitment()}
            >
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Textarea
            label="Message"
            rows={4}
            value={recruitMessage}
            onChange={(event) => setRecruitMessage(event.target.value)}
            placeholder="Add the details the candidate needs…"
          />
          {recruiting?.kind === 'interview' && (
            <Input
              label="Date & time (optional)"
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          )}
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this job offer?"
        description="All applications will be removed. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={removeJob} loading={busy}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}

function ApplicationProgress({ status }: { status: ApplicationStatus }) {
  const closed = status === 'REJECTED' || status === 'WITHDRAWN';
  const steps = [
    { label: 'Applied', done: true },
    { label: 'Reviewed', done: status !== 'PENDING' && !closed },
    {
      label: status === 'ACCEPTED' ? 'Accepted' : status === 'REJECTED' ? 'Rejected' : 'Decision',
      done: status === 'ACCEPTED' || status === 'REJECTED',
    },
  ];

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {steps.map((step) => (
        <span
          key={step.label}
          className={`rounded-full px-2 py-1 text-[11px] ${
            status === 'WITHDRAWN'
              ? 'bg-elevated text-subtle'
              : step.done
                ? 'bg-accent/10 text-accent'
                : 'bg-elevated text-muted'
          }`}
        >
          {step.done ? '✓ ' : '○ '}
          {status === 'WITHDRAWN' ? 'Withdrawn' : step.label}
        </span>
      ))}
    </div>
  );
}
