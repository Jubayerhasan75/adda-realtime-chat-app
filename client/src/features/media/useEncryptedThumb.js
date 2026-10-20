import { useEffect, useState } from 'react';
import { decryptedUrl } from './encryptedMedia.js';
import { localPreview } from './localPreviews.js';

/** Decrypted preview of an end-to-end encrypted file (or the copy on this device). */
export function useEncryptedThumb(attachment) {
  const local = localPreview(attachment.id);
  const [state, setState] = useState({ id: null, url: null, failed: false });
  useEffect(() => {
    if (local || !attachment.thumb) return undefined;
    let cancelled = false;
    decryptedUrl(attachment, 'thumb')
      .then((url) => !cancelled && setState({ id: attachment.id, url, failed: false }))
      .catch(() => !cancelled && setState({ id: attachment.id, url: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [attachment, local]);
  if (local) return { url: local, failed: false, missing: false };
  if (!attachment.thumb) return { url: null, failed: false, missing: true };
  return state.id === attachment.id
    ? { ...state, missing: false }
    : { url: null, failed: false, missing: false };
}
