import { cn } from '../../lib/cn.js';

/** Decorative spinner; pair it with visible or screen-reader text describing what is loading. */
export function Spinner({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none',
        className,
      )}
    />
  );
}
