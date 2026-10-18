import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { CURRENT_RELEASE } from '../../releaseNotes.js';

const STORAGE_KEY = 'adda.seen-version';

function readSeenVersion() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return CURRENT_RELEASE.version; // storage blocked: never nag
  }
}

function rememberVersion() {
  try {
    localStorage.setItem(STORAGE_KEY, CURRENT_RELEASE.version);
  } catch {
    // ignore
  }
}

/**
 * After an update, says once what changed. Not shown on a first visit (nothing "changed"
 * for a new user).
 */
export function WhatsNew() {
  const [open, setOpen] = useState(() => {
    const seen = readSeenVersion();
    if (seen === null) rememberVersion();
    return seen !== null && seen !== CURRENT_RELEASE.version;
  });

  const close = () => {
    rememberVersion();
    setOpen(false);
  };

  return (
    <Dialog open={open} onClose={close} title={`What’s new in Adda ${CURRENT_RELEASE.version}`}>
      <ul className="mb-5 flex list-disc flex-col gap-2 pl-5 text-[15px] text-text">
        {CURRENT_RELEASE.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <Button fullWidth onClick={close}>
        Got it
      </Button>
    </Dialog>
  );
}
