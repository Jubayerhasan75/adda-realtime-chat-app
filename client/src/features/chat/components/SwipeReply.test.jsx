import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from './MessageBubble.jsx';

const message = (overrides = {}) => ({
  id: 'm1',
  senderId: 'arif',
  text: 'Lets meet at 10',
  createdAt: new Date('2026-10-18T10:00:00Z'),
  reactions: [],
  attachments: [],
  ...overrides,
});

/** A finger dragging the bubble sideways by `dx` pixels. */
function swipe(element, dx) {
  const touch = { pointerType: 'touch', pointerId: 1, button: 0 };
  fireEvent.pointerDown(element, { ...touch, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(element, { ...touch, clientX: 100 + dx / 2, clientY: 101 });
  fireEvent.pointerMove(element, { ...touch, clientX: 100 + dx, clientY: 102 });
  fireEvent.pointerUp(element, { ...touch, clientX: 100 + dx, clientY: 102 });
}

const bubble = () => screen.getByText('Lets meet at 10').closest('[class*="rounded-bubble"]');

describe('swipe to reply', () => {
  it('a friend’s message replies when swiped right far enough, not left or a little', () => {
    const onReply = vi.fn();
    render(
      <MessageBubble
        message={message()}
        isOwn={false}
        isFirstInGroup
        isLastInGroup
        onReply={onReply}
      />,
    );
    swipe(bubble(), 30);
    swipe(bubble(), -90);
    expect(onReply).not.toHaveBeenCalled();
    swipe(bubble(), 90);
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }));
  });

  it('my own message replies when swiped left; a mouse drag never does', () => {
    const onReply = vi.fn();
    render(
      <MessageBubble
        message={message({ senderId: 'me' })}
        isOwn
        isFirstInGroup
        isLastInGroup
        onReply={onReply}
      />,
    );
    const mouse = { pointerType: 'mouse', pointerId: 2, button: 0 };
    fireEvent.pointerDown(bubble(), { ...mouse, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(bubble(), { ...mouse, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(bubble(), { ...mouse, clientX: 100, clientY: 100 });
    expect(onReply).not.toHaveBeenCalled();
    swipe(bubble(), -90);
    expect(onReply).toHaveBeenCalledOnce();
  });
});
