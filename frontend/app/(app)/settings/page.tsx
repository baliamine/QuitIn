import { Suspense } from 'react';
import { SettingsClient } from '@/components/settings/SettingsClient';

export const metadata = { title: 'Settings · QUITIN' };

function SettingsFallback() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-elevated/50" />
      <div className="h-40 animate-pulse rounded-xl bg-surface" />
      <div className="h-40 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsClient />
    </Suspense>
  );
}
