const DAY_MS = 24 * 60 * 60 * 1000;

/** Unread/badge counts: exact up to 99, then "99+". */
export function formatCount(count) {
  return count > 99 ? '99+' : String(count);
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole calendar days between two dates in local time (0 = same day). */
export function calendarDaysBetween(earlier, later) {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY_MS);
}

/** "14:05" / "2:05 PM" depending on the user's locale. */
export function formatTime(date, locale) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Conversation-list timestamp: time today, "Yesterday", weekday this week, else a short date. */
export function formatListTimestamp(date, now = new Date(), locale) {
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return formatTime(date, locale);
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

/** Divider label between days in a conversation. */
export function formatDayLabel(date, now = new Date(), locale) {
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat(locale, {
    weekday: days < 7 ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

/** "last seen today at 14:05" style presence text. */
export function formatLastSeen(date, now = new Date(), locale) {
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return `last seen today at ${formatTime(date, locale)}`;
  if (days === 1) return `last seen yesterday at ${formatTime(date, locale)}`;
  return `last seen ${formatListTimestamp(date, now, locale)}`;
}

/** "1:05" for a video length in milliseconds; null when unknown. */
export function formatDuration(ms) {
  if (!ms) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
