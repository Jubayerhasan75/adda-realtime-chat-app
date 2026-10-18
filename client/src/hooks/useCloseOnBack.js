import { useEffect, useRef } from 'react';

let nextHistoryKey = 0;
// A closed dialog removing its history entry: the browser does that asynchronously.
let backPending = null;

/** Steps back over a closed dialog's entry; resolves once the browser has done it. */
function removeEntry() {
  backPending = new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('popstate', done);
      backPending = null;
      resolve();
    };
    window.addEventListener('popstate', done);
  });
  window.history.back();
}

/**
 * Lets the phone's back button / back gesture close an open dialog instead of leaving the
 * page: opening adds a history entry for the same URL, and going back removes it again.
 * When the dialog is closed another way (✕, backdrop, Escape) that entry is removed, unless
 * the app has navigated somewhere else in the meantime. A dialog opened right as another one
 * closes (one leads to the next) waits until that entry is gone, so it isn't closed by it; with
 * dialogs stacked (a photo viewer over a sheet), back closes only the top one.
 */
export function useCloseOnBack(open, onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const key = `dialog-${(nextHistoryKey += 1)}`;
    let active = true;
    let pushed = false;
    let closedByBack = false;
    const handlePopState = () => {
      // Another dialog removing its own entry, or a back step that only closed a dialog
      // stacked on top of this one (this dialog's entry is still the current one).
      if (backPending || window.history.state?.dialogKey === key) return;
      closedByBack = true;
      onCloseRef.current();
    };
    const start = () => {
      if (!active) return;
      window.history.pushState({ ...window.history.state, dialogKey: key }, '');
      window.addEventListener('popstate', handlePopState);
      pushed = true;
    };
    if (backPending) backPending.then(start);
    else start();

    return () => {
      active = false;
      if (!pushed) return;
      window.removeEventListener('popstate', handlePopState);
      if (!closedByBack && window.history.state?.dialogKey === key) removeEntry();
    };
  }, [open]);
}
