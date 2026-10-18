import { ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { cn } from '../../lib/cn.js';

const ICON_COLORS = {
  blue: 'bg-blue-600',
  violet: 'bg-violet-600',
  red: 'bg-rose-600',
  green: 'bg-emerald-600',
  amber: 'bg-amber-600',
  sky: 'bg-sky-600',
  teal: 'bg-teal-600',
  gray: 'bg-slate-600',
  danger: 'bg-danger',
};

/** A titled card of setting rows (like Messenger's grouped settings). */
export function SettingsGroup({ title, footer, children }) {
  const headingId = useId();
  return (
    <section aria-labelledby={title ? headingId : undefined} className="flex flex-col gap-1.5">
      {title && (
        <h2
          id={headingId}
          className="px-2 text-xs font-semibold tracking-wide text-muted uppercase"
        >
          {title}
        </h2>
      )}
      <ul className="flex flex-col">{children}</ul>
      {footer && <p className="px-1 text-xs text-muted">{footer}</p>}
    </section>
  );
}

/** Plain card for a sub-page's content (switches, choices, forms). */
export function SettingsCard({ children, className }) {
  return <div className={cn('rounded-xl bg-surface-muted p-4', className)}>{children}</div>;
}

const rowClasses =
  'flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-(--duration-fast) hover:bg-surface-hover active:bg-surface-active disabled:opacity-60';

/**
 * One row: a coloured round icon, a label, an optional value line, and a chevron when it opens
 * another page. Pass `to` (opens a page) or `onClick` (does something right away).
 */
export function SettingsRow({
  to,
  onClick,
  icon: Icon,
  color = 'gray',
  label,
  value,
  tone,
  badge,
  loading = false,
}) {
  const content = (
    <>
      {Icon && (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full text-white',
            ICON_COLORS[color],
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[15px] font-medium',
            tone === 'danger' ? 'text-danger' : 'text-text',
          )}
        >
          {label}
        </span>
        {value && <span className="block truncate text-sm text-muted">{value}</span>}
      </span>
      {badge && (
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">
          {badge}
        </span>
      )}
      {loading && <Spinner className="size-4 shrink-0 text-muted" />}
      {to && <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-subtle" />}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className={rowClasses}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} disabled={loading} className={rowClasses}>
          {content}
        </button>
      )}
    </li>
  );
}
