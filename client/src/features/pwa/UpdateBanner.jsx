import { Sparkles } from 'lucide-react';
import { dismissUpdate, reloadToUpdate, usePwa } from './pwaStore.js';

/**
 * "Adda has been updated" with Reload / Later. Never reloads by itself mid-conversation; after
 * "Later" it comes back the next time the app checks (on reopening it).
 */
export function UpdateBanner() {
  const { updateReady, updateDismissed } = usePwa();
  if (!updateReady || updateDismissed) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-50 mx-auto flex w-[min(28rem,calc(100%-1rem))] items-center gap-3 rounded-xl bg-text px-4 py-3 text-sm text-surface shadow-lg"
    >
      <Sparkles aria-hidden="true" className="size-4 shrink-0" />
      <span className="flex-1">A new version of Adda is ready.</span>
      <button
        type="button"
        onClick={dismissUpdate}
        className="rounded-md px-2 py-1.5 font-medium opacity-80 hover:opacity-100"
      >
        Later
      </button>
      <button
        type="button"
        onClick={reloadToUpdate}
        className="rounded-md bg-surface px-3 py-1.5 font-semibold text-text active:scale-95"
      >
        Update
      </button>
    </div>
  );
}
