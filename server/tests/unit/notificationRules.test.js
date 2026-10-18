import { describe, expect, it } from 'vitest';
import { friendNotification, messageNotification } from '../../src/services/notificationRules.js';

const now = new Date('2026-10-17T12:00:00Z');
const sender = { displayName: 'Nadia' };
const envelope = { v: 1, sk: 'a', rk: 'b', iv: 'c', ct: 'sealed' };
const message = { conversationId: 'c1', senderId: 's1', clientMessageId: 'm1', envelope };
const recipient = (notifications = {}) => ({
  settings: {
    notifications: { enabled: true, preview: 'name_only', friendRequests: true, ...notifications },
  },
});
const decide = (overrides = {}) =>
  messageNotification({
    recipient: recipient(),
    sender,
    message,
    mutedUntil: null,
    appOnScreen: false,
    now,
    ...overrides,
  });

describe('message notifications', () => {
  it('by default shows who wrote, but not what (private lock screen)', () => {
    expect(decide()).toEqual({
      title: 'Nadia',
      body: 'New message',
      tag: 'chat-c1',
      url: '/chats/c1',
    });
  });

  it('passes the encrypted message along only when the recipient wants previews', () => {
    const withPreview = decide({ recipient: recipient({ preview: 'name_and_text' }) });
    expect(withPreview).toMatchObject({ title: 'Nadia', body: 'New message' });
    expect(withPreview.encrypted).toEqual({
      conversationId: 'c1',
      senderId: 's1',
      clientMessageId: 'm1',
      envelope,
    });
    expect(decide().encrypted).toBeUndefined();
    const hidden = decide({ recipient: recipient({ preview: 'none' }) });
    expect(hidden).toMatchObject({ title: 'Adda', body: 'New message' });
    expect(JSON.stringify(hidden)).not.toContain('Nadia');
  });

  it('leaves a too-large encrypted message out (push payloads are limited to ~4 KB)', () => {
    const big = { ...message, envelope: { ...envelope, ct: 'x'.repeat(5000) } };
    const result = decide({ recipient: recipient({ preview: 'name_and_text' }), message: big });
    expect(result.body).toBe('New message');
    expect(result.encrypted).toBeUndefined();
  });

  it('is not sent when off, muted, or while the app is open on screen', () => {
    expect(decide({ recipient: recipient({ enabled: false }) })).toBeNull();
    expect(decide({ mutedUntil: new Date('2026-10-17T13:00:00Z') })).toBeNull();
    expect(decide({ mutedUntil: new Date('2026-10-17T11:00:00Z') })).not.toBeNull(); // mute ended
    expect(decide({ appOnScreen: true })).toBeNull();
  });
});

describe('friend notifications', () => {
  it('announces requests and acceptances, respecting the switches and previews', () => {
    const actor = { displayName: 'Arif' };
    expect(
      friendNotification({ recipient: recipient(), actor, type: 'friend_request' }),
    ).toMatchObject({
      body: 'Arif sent you a friend request',
      url: '/friends',
    });
    expect(
      friendNotification({ recipient: recipient(), actor, type: 'friend_accepted' }).body,
    ).toBe('Arif accepted your friend request');
    expect(
      friendNotification({
        recipient: recipient({ friendRequests: false }),
        actor,
        type: 'friend_request',
      }),
    ).toBeNull();
    expect(
      friendNotification({
        recipient: recipient({ preview: 'none' }),
        actor,
        type: 'friend_request',
      }).body,
    ).toBe('Someone sent you a friend request');
  });
});
