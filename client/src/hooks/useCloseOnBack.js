import { useEffect, useRef } from 'react';

let nextHistoryKey = 0;

/**
 * Lets the phone's back button / back gesture close an open dialog instead of leaving the
 * page: opening adds a history entry for the same URL, and going back removes it again.
 * When the dialog is closed another way (✕, backdrop, Escape) that entry is removed, unless
 * the app has navigated somewhere else in the meantime.
 */
export function useCloseOnBack(open, onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const key = `dialog-${(nextHistoryKey += 1)}`;
    window.history.pushState({ ...window.history.state, dialogKey: key }, '');
    let closedByBack = false;
    const handlePopState = () => {
      closedByBack = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!closedByBack && window.history.state?.dialogKey === key) window.history.back();
    };
  }, [open]);
}
