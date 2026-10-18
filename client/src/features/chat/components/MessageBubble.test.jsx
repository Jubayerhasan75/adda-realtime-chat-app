import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from './MessageBubble.jsx';

const baseMessage = { text: '<b>not html</b>', createdAt: new Date(2026, 9, 16, 9, 5) };

describe('MessageBubble', () => {
  it('renders message text as plain text, never as HTML', () => {
    const { container } = render(
      <MessageBubble message={baseMessage} isOwn={false} isFirstInGroup isLastInGroup />,
    );

    expect(screen.getByText('<b>not html</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it.each([
    ['sending', 'Sending'],
    ['sent', 'Sent'],
    ['delivered', 'Delivered'],
    ['seen', 'Seen'],
    ['failed', 'Not sent'],
  ])('announces the %s state with a text label, not only color', (status, label) => {
    render(
      <MessageBubble message={{ ...baseMessage, status }} isOwn isFirstInGroup isLastInGroup />,
    );

    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('shows no delivery state on messages from the other person', () => {
    render(
      <MessageBubble
        message={{ ...baseMessage, status: 'seen' }}
        isOwn={false}
        isFirstInGroup
        isLastInGroup
      />,
    );

    expect(screen.queryByText('Seen')).toBeNull();
  });

  it('labels edited messages', () => {
    render(
      <MessageBubble
        message={{ ...baseMessage, editedAt: new Date() }}
        isOwn
        isFirstInGroup
        isLastInGroup
      />,
    );

    expect(screen.getByText('edited')).toBeInTheDocument();
  });

  it('offers Retry and Delete for a message that failed to send', async () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(
      <MessageBubble
        message={{ ...baseMessage, status: 'failed', error: 'You can only message your friends' }}
        isOwn
        isFirstInGroup
        isLastInGroup
        onRetry={onRetry}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('You can only message your friends');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
