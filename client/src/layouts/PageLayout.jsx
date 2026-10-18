import { ArrowLeft } from 'lucide-react';
import { IconButton } from '../components/ui/IconButton.jsx';
import { useGoBack } from '../hooks/useGoBack.js';

function BackButton({ to }) {
  const goBack = useGoBack(to);
  return (
    <IconButton label="Back" onClick={goBack} className="-ml-2">
      <ArrowLeft aria-hidden="true" className="size-5" />
    </IconButton>
  );
}

/**
 * Full-height section page (Friends, Settings) with a title bar and its own scroll area.
 * `backTo`: shows a back arrow (sub-pages such as Settings → Privacy).
 */
export function PageLayout({ title, backTo, children }) {
  return (
    <section
      aria-labelledby="page-title"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-border px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        {backTo && <BackButton to={backTo} />}
        <h1
          id="page-title"
          className={
            backTo
              ? 'truncate text-lg font-semibold text-text'
              : 'text-xl font-bold tracking-tight text-text'
          }
        >
          {title}
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">{children}</div>
      </div>
    </section>
  );
}
