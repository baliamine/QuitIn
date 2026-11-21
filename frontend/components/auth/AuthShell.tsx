import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import Image from "next/image";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden border-r border-border bg-surface px-12 py-12 lg:flex lg:flex-col">
        <Link
          href="/"
          className="text-2xl font-bold tracking-tight text-foreground"
        >
          QUITIN
        </Link>

        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight text-foreground">
              Grow your tech career, together.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              A focused space to build your profile, connect with peers, and
              discover new opportunities.
            </p>
          </div>

          <div className="mt-10 w-full max-w-lg">
            <Image
              src="/img/jobHunt03.png"
              alt="Grow your tech career illustrations"
              width={1040}
              height={720}
              className="h-auto w-full rounded-2xl object-contain"
              priority
            />
          </div>
        </div>
      </aside>

      <main className="relative flex min-h-screen flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-foreground lg:hidden"
          >
            QUITIN
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm text-muted">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>

        {footer && (
          <div className="text-center text-xs text-subtle">{footer}</div>
        )}
      </main>
    </div>
  );
}
