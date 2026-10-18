import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer.jsx';

function mockPointer(fine) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: query === '(pointer: fine)' ? fine : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('Composer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps Send disabled until there is non-whitespace text', async () => {
    mockPointer(true);
    render(<Composer onSend={vi.fn()} />);
    const send = screen.getByRole('button', { name: 'Send message' });

    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Message'), '   ');
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Message'), 'hi');
    expect(send).toBeEnabled();
  });

  it('sends trimmed text with the button and clears the field', async () => {
    mockPointer(false);
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);

    await userEvent.type(screen.getByLabelText('Message'), '  hello there  ');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSend).toHaveBeenCalledWith('hello there');
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it('sends on Enter and adds a line on Shift+Enter with a mouse/keyboard', async () => {
    mockPointer(true);
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = screen.getByLabelText('Message');

    await userEvent.type(input, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('line one\nline two');

    await userEvent.type(input, '{Enter}');
    expect(onSend).toHaveBeenCalledWith('line one\nline two');
  });

  it('treats Enter as a new line on touch devices', async () => {
    mockPointer(false);
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);

    await userEvent.type(screen.getByLabelText('Message'), 'a{Enter}b');

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Message')).toHaveValue('a\nb');
  });

  it('never sends while an IME composition (e.g. Bangla keyboard) is active', () => {
    mockPointer(true);
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);
    const input = screen.getByLabelText('Message');

    fireEvent.change(input, { target: { value: 'আমি' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('opens the emoji panel under the typing box, inserts at the cursor and stays open', async () => {
    mockPointer(true);
    localStorage.clear();
    render(<Composer onSend={vi.fn()} />);
    const input = screen.getByLabelText('Message');
    await userEvent.type(input, 'hi there');
    input.setSelectionRange(2, 2); // cursor after "hi"

    await userEvent.click(screen.getByRole('button', { name: 'Emoji and GIFs' }));
    const panel = screen.getByRole('region', { name: 'Emoji and GIFs' });
    const emojis = within(within(panel).getByRole('tabpanel')).getAllByRole('button');
    const [first, second] = [emojis[0].textContent, emojis[1].textContent];
    await userEvent.click(emojis[0]);
    await userEvent.click(emojis[1]);

    // The typing box stays visible and shows the emojis where the cursor was.
    expect(input).toBeVisible();
    expect(input).toHaveValue(`hi${first}${second} there`);
    expect(screen.getByRole('region', { name: 'Emoji and GIFs' })).toBeInTheDocument();

    // ⌫ removes one whole emoji, not half of it.
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete last character' }));
    expect(input).toHaveValue(`hi${first} there`);

    // Used emojis appear under "Recent" next time.
    expect(within(panel).getByRole('tab', { name: 'Smileys' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('chat.recent-emojis'))).toEqual([second, first]);
  });

  it('closes the emoji panel with the back button, a tap outside, or the keyboard button', async () => {
    mockPointer(true);
    render(
      <div>
        <p>messages</p>
        <Composer onSend={vi.fn()} />
      </div>,
    );
    const open = () => userEvent.click(screen.getByRole('button', { name: 'Emoji and GIFs' }));
    const panel = () => screen.queryByRole('region', { name: 'Emoji and GIFs' });

    await open();
    // The phone's back gesture: the panel's history entry is left, then popstate fires.
    window.history.replaceState(null, '');
    fireEvent.popState(window);
    expect(panel()).not.toBeInTheDocument();

    await open();
    fireEvent.pointerDown(screen.getByText('messages'));
    expect(panel()).not.toBeInTheDocument();

    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Show keyboard' }));
    expect(panel()).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveFocus();
  });

  it('offers GIFs as a tab in the same panel, but not while editing', async () => {
    mockPointer(true);
    const { rerender } = render(<Composer onSend={vi.fn()} onSendGif={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Emoji and GIFs' }));
    expect(screen.getByRole('tab', { name: 'GIF' })).toBeInTheDocument();

    rerender(
      <Composer
        onSend={vi.fn()}
        onSendGif={vi.fn()}
        initialText="old"
        context={{ kind: 'edit', title: 'Editing message', text: 'old' }}
      />,
    );
    expect(screen.queryByRole('tab', { name: 'GIF' })).not.toBeInTheDocument();
  });
});
