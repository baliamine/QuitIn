import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const FEATURES = [
  {
    title: 'Showcase your work',
    body: 'Build a professional profile with your skills, experience and education — then share what you are building.',
  },
  {
    title: 'Connect with developers',
    body: 'Follow the people whose work inspires you, from students to senior engineers and recruiters.',
  },
  {
    title: 'Real-time messaging',
    body: 'Have focused conversations with your network through fast, real-time private messaging.',
  },
  {
    title: 'AI assistant built in',
    body: 'Ask technical questions, prep for interviews and unblock yourself with the integrated AI assistant.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <span className="text-xl font-bold tracking-tight text-foreground">QUITIN</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonClasses('ghost', 'sm')}>
            Log in
          </Link>
          <Link href="/register" className={buttonClasses('primary', 'sm')}>
            Get started
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              A network for tech professionals
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Grow your tech career, together.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted">
              Join a focused network of developers, designers and builders. Share your work, connect with
              people in your field, and move your career forward.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className={buttonClasses('primary', 'lg')}>
                Get started
              </Link>
              <Link href="/login" className={buttonClasses('secondary', 'lg')}>
                Log in
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-accent/20" />
              <div>
                <div className="h-3 w-32 rounded bg-elevated" />
                <div className="mt-2 h-2.5 w-24 rounded bg-elevated" />
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-3 w-full rounded bg-elevated" />
              <div className="h-3 w-5/6 rounded bg-elevated" />
              <div className="h-3 w-4/6 rounded bg-elevated" />
            </div>
            <div className="mt-6 rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Open to opportunities</span>
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">
                  Hiring
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                Connect with teams, share projects, and discover roles that fit your skills.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface/50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="text-base font-semibold text-foreground">{feature.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-subtle">
          <span>© {new Date().getFullYear()} QUITIN</span>
          <span>Built for developers and creators</span>
        </div>
      </footer>
    </div>
  );
}
