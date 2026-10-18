import { LIMITS } from '@chat/shared';
import {
  Check,
  Delete,
  Keyboard,
  Paperclip,
  Pencil,
  Reply,
  SendHorizontal,
  Smile,
  X,
} from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconButton } from '../../../components/ui/IconButton.jsx';
import { useCloseOnBack } from '../../../hooks/useCloseOnBack.js';
import { cn } from '../../../lib/cn.js';
import { GifPicker } from '../../media/components/GifPicker.jsx';
import { ACCEPTED_FILES } from '../../media/upload.js';
import { EmojiPicker } from './EmojiPicker.jsx';

const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Length of the last character as people see it (an emoji like 👩‍💻 is several code units). */
function lastGraphemeLength(text) {
  if (typeof Intl.Segmenter === 'function') {
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
    return segments.at(-1)?.segment.length ?? 0;
  }
  return Array.from(text).at(-1)?.length ?? 0;
}

// Buttons beside the typing box must not take focus, or the phone keyboard would close.
const keepFocus = (event) => event.preventDefault();

/**
 * Bar above the input while replying to or editing a message.
 * @param {{ kind: 'reply' | 'edit', title: string, text: string, onCancel: () => void }} props
 */
function ContextBar({ kind, title, text, onCancel }) {
  const Icon = kind === 'edit' ? Pencil : Reply;
  return (
    <div className="flex items-center gap-2 border-t border-border bg-surface px-3 pt-2">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-link" />
      <div className="min-w-0 flex-1 border-l-2 border-primary pl-2 text-xs">
        <p className="font-semibold text-link">{title}</p>
        <p className="truncate text-muted">{text}</p>
      </div>
      <IconButton
        size="sm"
        label={kind === 'edit' ? 'Cancel editing' : 'Cancel reply'}
        onClick={onCancel}
      >
        <X aria-hidden="true" className="size-4" />
      </IconButton>
    </div>
  );
}

const PANEL_TABS = [
  ['emoji', 'Emoji'],
  ['gif', 'GIF'],
];

/**
 * Emoji (and GIF) panel shown below the typing box, in place of the phone keyboard, like
 * WhatsApp/Messenger: the message being written stays visible and keeps its cursor.
 */
function ExpressionPanel({ tab, onTab, showGifs, onEmoji, onBackspace, onGif }) {
  return (
    <section
      aria-label="Emoji and GIFs"
      className="flex h-[min(42dvh,320px)] flex-col gap-2 border-t border-border bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex shrink-0 items-center gap-1">
        {showGifs && (
          <div role="tablist" aria-label="Emoji or GIF" className="flex gap-1">
            {PANEL_TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onPointerDown={keepFocus}
                onClick={() => onTab(value)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-semibold',
                  tab === value ? 'bg-primary-soft text-link' : 'text-muted hover:bg-surface-hover',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {tab === 'emoji' && (
          <IconButton
            size="sm"
            label="Delete last character"
            className="ml-auto"
            onPointerDown={keepFocus}
            onClick={onBackspace}
          >
            <Delete aria-hidden="true" className="size-5" />
          </IconButton>
        )}
      </div>
      {tab === 'emoji' ? (
        <EmojiPicker onSelect={onEmoji} className="flex-1" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <GifPicker onSelect={onGif} />
        </div>
      )}
    </section>
  );
}

/**
 * Message input. On desktop Enter sends and Shift+Enter adds a line; on touch devices Enter
 * always adds a line (the send button sends). Never sends while an IME composition is active,
 * which matters for Bangla and other IME keyboards. Escape cancels a reply or edit.
 * Remount it (React `key`) to start from different `initialText`, e.g. when editing.
 *
 * Emoji/GIF panel: 😊 swaps the phone keyboard for the panel (⌨ swaps back). Tapping the
 * typing box, tapping outside, Escape or the phone's back button close it. Emojis go in at
 * the cursor and the panel stays open for more.
 *
 * Photos/videos: the 📎 button, or pasting images. They are shown in `attachments` above the
 * input; with attachments the text is an optional caption. `sendBlocked` keeps Send disabled
 * while uploads are still running.
 *
 * @param {{ onSend: (text: string) => void, onTyping?: () => void, onStopTyping?: () => void,
 *   initialText?: string, context?: { kind: 'reply' | 'edit', title: string, text: string } | null,
 *   onCancelContext?: () => void, disabled?: boolean, placeholder?: string,
 *   onAttachFiles?: (files: File[]) => void, onSendGif?: (gif: object) => void,
 *   attachments?: React.ReactNode, hasAttachments?: boolean, sendBlocked?: boolean }} props
 */
export function Composer({
  onSend,
  onTyping,
  onStopTyping,
  initialText = '',
  context = null,
  onCancelContext,
  disabled = false,
  placeholder = 'Message',
  onAttachFiles,
  onSendGif,
  attachments = null,
  hasAttachments = false,
  sendBlocked = false,
}) {
  const [text, setText] = useState(initialText);
  const [panel, setPanel] = useState(null); // null | 'emoji' | 'gif'
  const rootRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputId = useId();
  const editing = context?.kind === 'edit';
  const hasText = text.trim().length > 0;
  const canSend =
    !disabled && !sendBlocked && (hasText || hasAttachments) && !(editing && text === initialText);
  const showMediaButtons = !editing && !disabled;
  const showGifs = Boolean(onSendGif) && showMediaButtons && !hasAttachments;

  // Grow with the content up to the CSS max-height, then scroll.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [text]);

  const openPanel = (tab) => {
    const textarea = textareaRef.current;
    if (isTouchDevice()) {
      // Keep the cursor in the typing box, but put the panel where the keyboard was.
      textarea.blur();
      textarea.setAttribute('inputmode', 'none');
    }
    setPanel(tab);
    textarea.focus({ preventScroll: true });
  };

  const closePanel = ({ showKeyboard = false } = {}) => {
    setPanel(null);
    const textarea = textareaRef.current;
    if (!textarea || textarea.getAttribute('inputmode') !== 'none') return;
    textarea.blur();
    textarea.removeAttribute('inputmode');
    if (showKeyboard) textarea.focus();
  };

  useCloseOnBack(panel !== null, () => closePanel());

  // A tap anywhere outside the typing area (e.g. on the messages) closes the panel.
  useEffect(() => {
    if (!panel) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) closePanel();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  });

  const send = () => {
    if (!canSend) return;
    onStopTyping?.();
    onSend(text.trim());
    setText('');
    textareaRef.current.focus({ preventScroll: true });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && panel) {
      event.preventDefault();
      closePanel({ showKeyboard: true });
      return;
    }
    if (event.key === 'Escape' && context) {
      event.preventDefault();
      onCancelContext?.();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    event.preventDefault();
    send();
  };

  const insertEmoji = (emoji) => {
    const textarea = textareaRef.current;
    if (textarea.value.length + emoji.length > LIMITS.MESSAGE_TEXT_MAX) return;
    textarea.setRangeText(emoji, textarea.selectionStart, textarea.selectionEnd, 'end');
    setText(textarea.value);
    onTyping?.();
  };

  const deleteBackward = () => {
    const textarea = textareaRef.current;
    const end = textarea.selectionEnd;
    let start = textarea.selectionStart;
    if (start === end) start -= lastGraphemeLength(textarea.value.slice(0, start));
    if (start === end) return;
    textarea.setRangeText('', start, end, 'end');
    setText(textarea.value);
    if (!textarea.value.trim()) onStopTyping?.();
  };

  return (
    <div ref={rootRef} className="shrink-0">
      {context && <ContextBar {...context} onCancel={onCancelContext} />}
      {attachments}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className={cn(
          'flex items-end gap-1.5 border-t border-border bg-surface px-2 pt-2 sm:px-3',
          panel ? 'pb-2' : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        )}
      >
        <div className="flex min-w-0 flex-1 items-end rounded-[22px] border border-transparent bg-surface-muted focus-within:border-primary">
          <IconButton
            label={panel ? 'Show keyboard' : 'Emoji and GIFs'}
            aria-expanded={panel !== null}
            onPointerDown={keepFocus}
            onClick={() => (panel ? closePanel({ showKeyboard: true }) : openPanel('emoji'))}
            disabled={disabled}
          >
            {panel ? (
              <Keyboard aria-hidden="true" className="size-5" />
            ) : (
              <Smile aria-hidden="true" className="size-5" />
            )}
          </IconButton>
          <label htmlFor={inputId} className="sr-only">
            Message
          </label>
          <textarea
            id={inputId}
            ref={textareaRef}
            rows={1}
            value={text}
            maxLength={LIMITS.MESSAGE_TEXT_MAX}
            disabled={disabled}
            placeholder={hasAttachments ? 'Add a caption…' : placeholder}
            onPaste={(event) => {
              const files = [...event.clipboardData.files];
              if (files.length === 0 || !onAttachFiles || editing) return;
              event.preventDefault();
              onAttachFiles(files);
            }}
            onClick={() => {
              if (panel && isTouchDevice()) closePanel({ showKeyboard: true });
            }}
            autoFocus={editing}
            onChange={(event) => {
              setText(event.target.value);
              if (event.target.value.trim()) onTyping?.();
              else onStopTyping?.();
            }}
            onBlur={() => onStopTyping?.()}
            onKeyDown={handleKeyDown}
            enterKeyHint="send"
            className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 leading-snug text-text placeholder:text-subtle focus:outline-none disabled:opacity-60"
          />
          {showMediaButtons && onAttachFiles && (
            <>
              <IconButton
                label="Add photos or videos"
                onPointerDown={keepFocus}
                onClick={() => fileInputRef.current.click()}
              >
                <Paperclip aria-hidden="true" className="size-5" />
              </IconButton>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILES}
                multiple
                hidden
                data-testid="attach-input"
                onChange={(event) => {
                  onAttachFiles([...event.target.files]);
                  event.target.value = '';
                }}
              />
            </>
          )}
        </div>
        <IconButton
          type="submit"
          label={editing ? 'Save edit' : 'Send message'}
          variant="primary"
          disabled={!canSend}
          onPointerDown={keepFocus}
        >
          {editing ? (
            <Check aria-hidden="true" className="size-5" />
          ) : (
            <SendHorizontal aria-hidden="true" className="size-5" />
          )}
        </IconButton>
      </form>
      {panel && (
        <ExpressionPanel
          tab={showGifs ? panel : 'emoji'}
          onTab={setPanel}
          showGifs={showGifs}
          onEmoji={insertEmoji}
          onBackspace={deleteBackward}
          onGif={(gif) => {
            closePanel();
            onSendGif(gif);
          }}
        />
      )}
    </div>
  );
}
