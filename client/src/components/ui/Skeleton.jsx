import { cn } from '../../lib/cn.js';

/** Placeholder block with a fixed size so loaded content does not shift the layout. */
export function Skeleton({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none',
        className,
      )}
    />
  );
}
