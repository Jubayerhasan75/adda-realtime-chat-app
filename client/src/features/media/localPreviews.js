// Photos/videos I just sent are shown from the copy already on this device (an object URL),
// so they appear instantly and aren't downloaded again. Kept for this tab only; the oldest
// entries are released so memory doesn't grow without limit.
const MAX_ENTRIES = 60;
const previews = new Map();

export function rememberPreview(attachmentId, url) {
  previews.set(attachmentId, url);
  while (previews.size > MAX_ENTRIES) {
    const [oldestId, oldestUrl] = previews.entries().next().value;
    URL.revokeObjectURL(oldestUrl);
    previews.delete(oldestId);
  }
}

export const localPreview = (attachmentId) => previews.get(attachmentId) ?? null;
