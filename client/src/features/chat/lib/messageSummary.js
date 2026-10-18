const LABELS = {
  image: ['📷 Photo', 'photos'],
  video: ['🎥 Video', 'videos'],
};

/** "📷 Photo", "3 photos", "2 photos and videos"… for a list of attachments. */
function attachmentsLabel(attachments) {
  const kinds = new Set(attachments.map((a) => a.kind));
  if (attachments.length === 1) return LABELS[attachments[0].kind][0];
  if (kinds.size === 1) return `${attachments.length} ${LABELS[attachments[0].kind][1]}`;
  return `${attachments.length} photos and videos`;
}

/**
 * One-line text for a message where only a summary fits: the chat list, pinned bar, reply
 * quotes and the reply/edit bar. Media and GIFs get a label, plus the caption if there is one.
 */
export function messageSummary(message) {
  if (!message) return '';
  if (message.unsentAt || message.unsent) return 'Message unsent';
  if (message.undecryptable) return '🔒 Can’t be decrypted on this device';
  if (message.type === 'gif' || message.gif || message.mediaKind === 'gif') return 'GIF';
  if (message.attachments?.length) {
    const label = attachmentsLabel(message.attachments);
    return message.text ? `${label} · ${message.text}` : label;
  }
  if (!message.text && message.mediaKind) return LABELS[message.mediaKind]?.[0] ?? '';
  return message.text ?? '';
}
