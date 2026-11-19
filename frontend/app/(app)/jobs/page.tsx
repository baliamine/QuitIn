'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { JobCard, APPLICATION_LABELS } from '@/components/jobs/JobCard';
import { useAuth } from '@/hooks/useAuth';
import { jobsService } from '@/lib/services';
import { cn, timeAgo } from '@/lib/utils';
import type { Job, JobApplication, JobType } from '@/types';

type Tab = 'browse' | 'postings' | 'applications';

const TYPES: { value: JobType | ''; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
];

export default function JobsPage() {
  const { user } = useAuth();
  const isCompany = user?.role === 'COMPANY';
  const [tab, setTab] = useState<Tab>('browse');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<JobType | ''>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'postings') {
        const res = await jobsService.mine();
        setJobs(res.jobs);
      } else if (tab === 'applications') {
        const res = await jobsService.myApplications();
        setApplications(res.applications);
      } else {
        const res = await jobsService.list({
          q: q || undefined,
          location: location || undefined,
          type: type || undefined,
        });
        setJobs(res.jobs);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, q, location, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: Tab[] = isCompany ? ['browse', 'postings'] : ['browse', 'applications'];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
          <p className="mt-1 text-sm text-muted">
            {isCompany ? 'Post and manage your job offers.' : 'Find your next opportunity.'}
          </p>
        </div>
        {isCompany && (
          <Link href="/jobs/new" className={buttonClasses('primary', 'md')}>
            Post a job
          </Link>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setTab(item);
              setLoading(true);
            }}
            className={cn(
              'border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors',
              tab === item
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            name="q"
            placeholder="Job title or keyword"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Input
            name="location"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as JobType | '')}
            className="h-10 rounded-lg border border-border bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
          >
            {TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === 'applications' ? (
        <Card>
          <CardHeader title="My applications" />
          {applications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="Browse jobs and apply to one to see it here."
            />
          ) : (
            <div className="space-y-3">
              {applications.map((application) => (
                <div
                  key={application.id}
                  className="rounded-lg border border-border p-4 transition-colors hover:border-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/jobs/${application.job?.id}`}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {application.job?.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        @{application.job?.company.username} · applied {timeAgo(application.createdAt)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-accent">
                      {APPLICATION_LABELS[application.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-subtle">
                    Applied ✓ · Reviewed {application.status === 'PENDING' ? '○' : '✓'} · Decision{' '}
                    {application.status === 'ACCEPTED' || application.status === 'REJECTED' ? '✓' : '○'}
                  </p>
                  <Link
                    href={`/messages?to=${encodeURIComponent(application.job?.company.username ?? '')}`}
                    className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
                  >
                    Message company
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : jobs.length === 0 ? (
        <EmptyState
          title={tab === 'postings' ? 'No job offers posted' : 'No jobs found'}
          description={
            tab === 'postings'
              ? 'Post your first job offer to start receiving applications.'
              : 'Try changing your search filters.'
          }
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
