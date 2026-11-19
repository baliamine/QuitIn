'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { jobsService } from '@/lib/services';
import type { JobType } from '@/types';

const TYPES: { value: JobType; label: string }[] = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
];

export default function NewJobPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user?.role !== 'COMPANY') router.replace('/jobs');
  }, [loading, user, router]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    type: 'FULL_TIME' as JobType,
    salaryMin: '',
    salaryMax: '',
  });
  const [saving, setSaving] = useState(false);

  if (loading || user?.role !== 'COMPANY') return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const job = await jobsService.create({
        title: form.title,
        description: form.description,
        location: form.location,
        type: form.type,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
      });
      toast.success('Job offer posted');
      router.push(`/jobs/${job.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not post the job');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader title="Post a job offer" />
        <form onSubmit={submit} className="space-y-4">
          <Input
            name="title"
            label="Job title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="location"
              label="Location"
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
            <div>
              <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-foreground">
                Employment type
              </label>
              <select
                id="type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as JobType })}
                className="h-10 w-full rounded-lg border border-border bg-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/60"
              >
                {TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              name="salaryMin"
              label="Minimum salary (optional)"
              type="number"
              min={0}
              value={form.salaryMin}
              onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
            />
            <Input
              name="salaryMax"
              label="Maximum salary (optional)"
              type="number"
              min={0}
              value={form.salaryMax}
              onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
            />
          </div>
          <Textarea
            name="description"
            label="Description"
            required
            rows={10}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Publish job
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
