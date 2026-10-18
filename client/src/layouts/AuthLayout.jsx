import { MessageCircle } from 'lucide-react';

/** Centered card used by login, registration and email-link pages. Scrolls on short screens. */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="mb-6 flex items-center gap-2 text-link">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-on-primary">
            <MessageCircle aria-hidden="true" className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">Adda</span>
        </div>
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-text">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </section>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </main>
    </div>
  );
}
