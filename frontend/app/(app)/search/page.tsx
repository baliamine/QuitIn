import { Suspense } from 'react';
import { SearchClient } from '@/components/search/SearchClient';
import { Spinner } from '@/components/ui/Feedback';

export const metadata = { title: 'Search · QUITIN' };

export default function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; tab?: string };
}) {
  const initialTab = searchParams.tab === 'posts' ? 'posts' : 'people';
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      }
    >
      <SearchClient initialQuery={searchParams.q ?? ''} initialTab={initialTab} />
    </Suspense>
  );
}
