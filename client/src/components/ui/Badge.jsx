import { cn } from '../../lib/cn.js';
import { formatCount } from '../../lib/format.js';

/**
 * Unread-count pill. Renders nothing for 0.
 * @param {{ count: number, muted?: boolean, label?: string, className?: string }} props
 */
export function Badge({ count, muted = false, label, className }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
        muted ? 'bg-surface-muted text-muted' : 'bg-primary text-on-primary',
        className,
      )}
    >
      {formatCount(count)}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  );
}
