'use client';

import { Navbar } from '@/components/layout/Navbar';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-10">{children}</main>
      </div>
    </ProtectedRoute>
  );
}
