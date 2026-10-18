import { calendarDaysBetween } from '../../../lib/format.js';

/** Messages from the same sender closer than this are drawn as one visual group. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** True when `later` directly continues `earlier`'s group (either may be missing). */
function sameGroup(earlier, later) {
  return Boolean(
    earlier &&
    later &&
    earlier.senderId === later.senderId &&
    calendarDaysBetween(earlier.createdAt, later.createdAt) === 0 &&
    later.createdAt - earlier.createdAt < GROUP_WINDOW_MS,
  );
}

/**
 * Turns an ordered message array into render items: day dividers, an optional unread divider,
 * and messages annotated with their position in a sender group (for bubble corners/spacing).
 *
 * @param {Array<{ id: string, senderId: string, createdAt: Date }>} messages ordered oldest → newest
 * @param {{ currentUserId: string, firstUnreadId?: string | null }} options
 */
export function groupMessages(messages, { currentUserId, firstUnreadId = null }) {
  const items = [];

  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const startsNewDay =
      !previous || calendarDaysBetween(previous.createdAt, message.createdAt) !== 0;

    if (startsNewDay) {
      items.push({ type: 'day', key: `day-${message.id}`, date: message.createdAt });
    }
    if (message.id === firstUnreadId) {
      items.push({ type: 'unread', key: 'unread-divider' });
    }

    const isFirstInGroup =
      startsNewDay || message.id === firstUnreadId || !sameGroup(previous, message);
    const isLastInGroup = !sameGroup(message, next) || next.id === firstUnreadId;

    items.push({
      type: 'message',
      key: message.id,
      message,
      isOwn: message.senderId === currentUserId,
      isFirstInGroup,
      isLastInGroup,
    });
  });

  return items;
}
