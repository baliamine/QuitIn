'use client';

import { AuthProvider } from '@/hooks/useAuth';
import { CallProvider } from '@/components/calls/CallProvider';
import { ToastProvider } from '@/components/ui/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <CallProvider>{children}</CallProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
