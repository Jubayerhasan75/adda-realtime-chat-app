import { useId } from 'react';
import { cn } from '../../lib/cn.js';

/** Titled card grouping related settings. */
export function SettingsSection({ title, description, children, tone = 'default' }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'rounded-lg border p-4 sm:p-5',
        tone === 'danger' ? 'border-danger/40' : 'border-border',
      )}
    >
      <h2
        id={headingId}
        className={cn('text-base font-semibold', tone === 'danger' ? 'text-danger' : 'text-text')}
      >
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
