import { useCurrentToast } from '../../lib/toast.js';

/** Renders the current toast; mount once in the app shell. Announced to screen readers. */
export function ToastRegion() {
  const toast = useCurrentToast();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] z-50 flex justify-center px-4 lg:bottom-6"
    >
      {toast && (
        <p
          key={toast.id}
          className="rounded-full bg-text px-4 py-2 text-sm font-medium text-surface shadow-lg"
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}
