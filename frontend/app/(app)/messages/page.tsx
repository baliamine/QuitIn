import { Suspense } from 'react';
import { MessagesClient } from '@/components/messaging/MessagesClient';
import { Spinner } from '@/components/ui/Feedback';

export const metadata = { title: 'Messages · QUITIN' };

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      }
    >
      <MessagesClient />
    </Suspense>
  );
}
