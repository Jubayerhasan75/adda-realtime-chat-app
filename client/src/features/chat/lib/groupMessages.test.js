import { describe, expect, it } from 'vitest';
import { groupMessages } from './groupMessages.js';

const at = (day, hour, minute) => new Date(2026, 9, day, hour, minute);
const msg = (id, senderId, createdAt) => ({ id, senderId, createdAt });

const summary = (items) =>
  items.map((item) =>
    item.type === 'message'
      ? `${item.key}:${item.isOwn ? 'own' : 'peer'}:${item.isFirstInGroup ? 'F' : '-'}${item.isLastInGroup ? 'L' : '-'}`
      : item.type,
  );

describe('groupMessages', () => {
  it('returns nothing for an empty conversation', () => {
    expect(groupMessages([], { currentUserId: 'me' })).toEqual([]);
  });

  it('groups consecutive messages from one sender within five minutes', () => {
    const items = groupMessages(
      [
        msg('a', 'peer', at(16, 10, 0)),
        msg('b', 'peer', at(16, 10, 2)),
        msg('c', 'peer', at(16, 10, 4)),
        msg('d', 'me', at(16, 10, 5)),
      ],
      { currentUserId: 'me' },
    );

    expect(summary(items)).toEqual(['day', 'a:peer:F-', 'b:peer:--', 'c:peer:-L', 'd:own:FL']);
  });

  it('starts a new group after a five-minute gap', () => {
    const items = groupMessages([msg('a', 'me', at(16, 10, 0)), msg('b', 'me', at(16, 10, 6))], {
      currentUserId: 'me',
    });

    expect(summary(items)).toEqual(['day', 'a:own:FL', 'b:own:FL']);
  });

  it('inserts a day divider and breaks groups across midnight', () => {
    const items = groupMessages([msg('a', 'me', at(15, 23, 58)), msg('b', 'me', at(16, 0, 1))], {
      currentUserId: 'me',
    });

    expect(summary(items)).toEqual(['day', 'a:own:FL', 'day', 'b:own:FL']);
  });

  it('places the unread divider before the first unread message and splits the group there', () => {
    const items = groupMessages(
      [
        msg('a', 'peer', at(16, 10, 0)),
        msg('b', 'peer', at(16, 10, 1)),
        msg('c', 'peer', at(16, 10, 2)),
      ],
      { currentUserId: 'me', firstUnreadId: 'b' },
    );

    expect(summary(items)).toEqual(['day', 'a:peer:FL', 'unread', 'b:peer:F-', 'c:peer:-L']);
  });
});
