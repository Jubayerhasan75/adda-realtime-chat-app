import { describe, expect, it } from 'vitest';
import { chatTitle, nameOf, systemText } from './chatInfo.js';

const conversation = {
  peer: { id: 'arif', displayName: 'Arif Khan' },
  nicknameMap: { arif: 'Rafi bhai' },
};
const notice = (senderId, system, extra = {}) => ({ senderId, system, ...extra });

describe('nicknames and chat notices', () => {
  it('shows nicknames as the chat title and names', () => {
    expect(chatTitle(conversation).name).toBe('Rafi bhai');
    expect(nameOf(conversation, 'arif', 'me')).toBe('Rafi bhai');
    expect(nameOf(conversation, 'arif', 'me', { real: true })).toBe('Arif Khan');
  });

  it('words nickname and color notices from my point of view', () => {
    const set = (senderId, target, nickname) =>
      systemText(
        notice(senderId, { action: 'nickname', targetIds: [target] }, { nickname }),
        conversation,
        'me',
      );
    expect(set('me', 'arif', 'Rafi bhai')).toBe(
      'You set the nickname for Arif Khan to “Rafi bhai”',
    );
    expect(set('arif', 'me', 'Boss')).toBe('Rafi bhai set your nickname to “Boss”');
    expect(set('me', 'me', 'Jubu')).toBe('You set your nickname to “Jubu”');
    expect(set('arif', 'arif', null)).toBe('Rafi bhai cleared their nickname');
    expect(
      systemText(
        notice('arif', { action: 'theme', name: 'ocean', targetIds: [] }),
        conversation,
        'me',
      ),
    ).toBe('Rafi bhai changed the chat color to Ocean');
    expect(
      systemText(
        notice('me', { action: 'theme', name: '#ff5a1f', targetIds: [] }),
        conversation,
        'me',
      ),
    ).toBe('You changed the chat color to a custom color');
  });
});
