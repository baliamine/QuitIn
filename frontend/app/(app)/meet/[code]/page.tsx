'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MeetingClient } from '@/components/meetings/MeetingClient';
import { EmptyState, Spinner } from '@/components/ui/Feedback';

export default function MeetingPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    // The room code is part of the URL and the join happens inside MeetingClient.
    setStatus('ready');
  }, [params.code]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          title="Meeting not found"
          description="This meeting room does not exist or has ended."
          icon={<span className="text-2xl">🫥</span>}
        />
      </div>
    );
  }

  return <MeetingClient roomCode={params.code} />;
}
