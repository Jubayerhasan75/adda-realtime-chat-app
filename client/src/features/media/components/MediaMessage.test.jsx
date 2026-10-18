import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../../chat/components/MessageBubble.jsx';

const createdAt = new Date(2026, 9, 17, 9, 5);
const photo = {
  id: 'p1',
  kind: 'image',
  mimeType: 'image/jpeg',
  width: 1200,
  height: 900,
  size: 1,
};
const video = {
  id: 'v1',
  kind: 'video',
  mimeType: 'video/mp4',
  width: 720,
  height: 1280,
  durationMs: 65_000,
  size: 1,
};

describe('media in messages', () => {
  it('shows photos through the protected media URL with the space reserved, plus the caption', async () => {
    const onOpenMedia = vi.fn();
    const message = { id: 'm1', type: 'media', text: 'Trip!', attachments: [photo], createdAt };
    const { container } = render(
      <MessageBubble
        message={message}
        isOwn={false}
        isFirstInGroup
        isLastInGroup
        onOpenMedia={onOpenMedia}
      />,
    );

    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', '/api/media/p1?variant=thumb');
    expect(image.closest('[style]').style.aspectRatio).toBe(`${1200 / 900} / 1`);
    expect(screen.getByText('Trip!')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Photo 1 of 1. Open' }));
    expect(onOpenMedia).toHaveBeenCalledWith(message, 0);
  });

  it('shows a video poster with its length, and "+N" beyond four items', () => {
    const many = [video, ...['a', 'b', 'c', 'd', 'e'].map((id) => ({ ...photo, id }))];
    render(
      <MessageBubble
        message={{ id: 'm2', type: 'media', text: null, attachments: many, createdAt }}
        isOwn
        isFirstInGroup
        isLastInGroup
      />,
    );

    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Video 1 of 6. Open' }).querySelector('img'),
    ).toHaveAttribute('src', '/api/media/v1?variant=poster');
    expect(screen.getAllByRole('button', { name: /Open$/ })).toHaveLength(4);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('shows a GIF from KLIPY with its title as the description', () => {
    const gif = {
      provider: 'klipy',
      id: 'hello',
      title: 'Hello',
      url: 'https://static.klipy.com/ii/x/hello.webp',
      previewUrl: 'https://static.klipy.com/ii/x/hello-sm.webp',
      width: 498,
      height: 498,
    };
    render(
      <MessageBubble
        message={{ id: 'm3', type: 'gif', text: null, gif, createdAt }}
        isOwn={false}
        isFirstInGroup
        isLastInGroup
      />,
    );
    expect(screen.getByRole('img', { name: 'GIF: Hello' })).toHaveAttribute('src', gif.url);
  });

  it('shows nothing of the media once a message is unsent', () => {
    const { container } = render(
      <MessageBubble
        message={{
          id: 'm4',
          type: 'media',
          text: null,
          attachments: [photo],
          unsentAt: new Date(),
          createdAt,
        }}
        isOwn={false}
        isFirstInGroup
        isLastInGroup
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('This message was unsent')).toBeInTheDocument();
  });
});
