'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Feedback';
import { timeAgo } from '@/lib/utils';
import type { ApplicationStatus, Job } from '@/types';

export const JOB_TYPE_LABELS: Record<Job['type'], string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

export const APPLICATION_LABELS: Record<ApplicationStatus, string> = {
  PENDING: 'Pending',
  REVIEWED: 'Reviewed',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export function salaryLabel(job: Job) {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  if (job.salaryMin != null && job.salaryMax != null) return `$${job.salaryMin} – $${job.salaryMax}`;
  if (job.salaryMin != null) return `From $${job.salaryMin}`;
  return `Up to $${job.salaryMax}`;
}

export function JobCard({ job }: { job: Job }) {
  const application = job.myApplication ?? job.applications?.[0] ?? null;
  const companyName = job.company.profile?.company || `@${job.company.username}`;
  const salary = salaryLabel(job);

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-strong"
    >
      <div className="flex items-start gap-3">
        <Avatar
          src={job.company.profile?.avatarUrl}
          name={companyName}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate text-sm font-semibold text-foreground">{job.title}</p>
            <span className="shrink-0 text-xs text-subtle">{timeAgo(job.createdAt)}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {companyName} · {job.location}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge>{JOB_TYPE_LABELS[job.type]}</Badge>
            {job.status === 'CLOSED' && <Badge className="text-muted">Closed</Badge>}
            {salary && <Badge>{salary}</Badge>}
            {application && (
              <Badge className="border-accent/30 text-accent">
                Applied · {APPLICATION_LABELS[application.status]}
              </Badge>
            )}
            {job._count != null && (
              <span className="text-xs text-subtle">
                {job._count.applications} applicant{job._count.applications === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
