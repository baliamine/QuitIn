'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { notificationsService } from '@/lib/services';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/feed', label: 'Feed', icon: HomeIcon },
  { href: '/search', label: 'Search', icon: SearchIcon },
  { href: '/messages', label: 'Messages', icon: ChatIcon },
  { href: '/assistant', label: 'Assistant', icon: SparkIcon },
];

function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
function ChatIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
    </svg>
  );
}
function SparkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" strokeLinecap="round" />
    </svg>
  );
}
function BellIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
    </svg>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      notificationsService
        .unreadCount()
        .then((res) => active && setUnread(res.count))
        .catch(() => undefined);
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/feed" className="mr-2 text-lg font-bold tracking-tight text-foreground">
            QUITIN
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              const unreadForItem = item.href === '/messages' ? unread : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-elevated text-foreground' : 'text-muted hover:bg-elevated hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {unreadForItem > 0 && (
                    <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
                      {unreadForItem > 9 ? '9+' : unreadForItem}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/notifications"
              className={cn(
                'relative rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-foreground',
                pathname === '/notifications' && 'bg-elevated text-foreground',
              )}
              aria-label="Notifications"
            >
              <BellIcon className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>

            {user && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-90"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                >
                  <Avatar
                    src={user.profile?.avatarUrl}
                    name={user.profile?.headline || user.username}
                    size="sm"
                  />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-52 animate-fade-in overflow-hidden rounded-xl border border-border bg-elevated py-1 shadow-xl">
                    <div className="border-b border-border px-4 py-2.5">
                      <p className="truncate text-sm font-medium text-foreground">@{user.username}</p>
                    </div>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        router.push(`/profile/${user.username}`);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-surface hover:text-foreground"
                    >
                      View profile
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        router.push('/settings');
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-surface hover:text-foreground"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => void logout()}
                      className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-surface"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-background/95 backdrop-blur md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]',
                active ? 'text-accent' : 'text-subtle',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        {user && (
          <Link
            href={`/profile/${user.username}`}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]',
              pathname.startsWith('/profile') ? 'text-accent' : 'text-subtle',
            )}
          >
            <Avatar
              src={user.profile?.avatarUrl}
              name={user.profile?.headline || user.username}
              size="sm"
              className="h-5 w-5 text-[9px]"
            />
            Profile
          </Link>
        )}
      </nav>
    </>
  );
}
