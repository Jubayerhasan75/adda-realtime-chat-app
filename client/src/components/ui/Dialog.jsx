import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useCloseOnBack } from '../../hooks/useCloseOnBack.js';
import { IconButton } from './IconButton.jsx';

/**
 * Modal dialog on the native <dialog> element, which provides focus trapping, Escape-to-close
 * and an inert background for free. Shown as a bottom sheet on phones. Closes on the ✕, a tap
 * outside, Escape, or the phone's back button.
 * @param {{ open: boolean, onClose: () => void, title: string, children: React.ReactNode }} props
 */
export function Dialog({ open, onClose, title, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useCloseOnBack(open, onClose);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> element itself.
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border border-border bg-surface p-0 text-text shadow-lg backdrop:bg-overlay max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]"
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <IconButton label="Close" size="sm" onClick={onClose}>
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
