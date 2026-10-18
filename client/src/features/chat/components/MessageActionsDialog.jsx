import { LIMITS } from '@chat/shared';
import { Copy, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Dialog } from '../../../components/ui/Dialog.jsx';
import { showToast } from '../../../lib/toast.js';
import { cn } from '../../../lib/cn.js';
import { useDeleteForMe, usePinToggle, useReact, useUnreact, useUnsendMessage } from '../api.js';
import { QUICK_REACTIONS } from '../emojiData.js';
import { EmojiPicker } from './EmojiPicker.jsx';
import { messageSummary } from '../lib/messageSummary.js';

const MINUTE = 60_000;

function ActionButton({ icon: Icon, label, onClick, tone = 'default', disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] hover:bg-surface-hover disabled:opacity-50',
        tone === 'danger' ? 'text-danger' : 'text-text',
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      {label}
    </button>
  );
}

/**
 * Actions for one message. `openedAt` is captured when the menu opens so the edit/unsend time
 * windows are evaluated once, outside rendering.
 * @param {{ target: { message: object, openedAt: number } | null, currentUserId: string,
 *   canMessage: boolean, onClose: () => void, onReply: (m: object) => void, onEdit: (m: object) => void }} props
 */
export function MessageActionsDialog({
  target,
  currentUserId,
  canMessage,
  onClose,
  onReply,
  onEdit,
}) {
  const [picking, setPicking] = useState(false);
  const [confirmUnsend, setConfirmUnsend] = useState(false);
  const react = useReact();
  const unreact = useUnreact();
  const pin = usePinToggle();
  const deleteForMe = useDeleteForMe();
  const unsend = useUnsendMessage();
  const error = [react, unreact, pin, deleteForMe, unsend].find((m) => m.isError)?.error;

  const close = () => {
    setPicking(false);
    setConfirmUnsend(false);
    [react, unreact, pin, deleteForMe, unsend].forEach((m) => m.reset());
    onClose();
  };

  const message = target?.message;
  const age = message ? target.openedAt - message.createdAt.getTime() : 0;
  const isOwn = message?.senderId === currentUserId;
  const unsent = Boolean(message?.unsentAt);
  const myReaction = message?.reactions?.find((r) => r.userId === currentUserId)?.emoji;
  const canEdit =
    isOwn &&
    !unsent &&
    canMessage &&
    message.type !== 'media' &&
    !message.gif &&
    !message.undecryptable &&
    age < LIMITS.MESSAGE_EDIT_WINDOW_MINUTES * MINUTE;
  const canUnsend = isOwn && !unsent && age < LIMITS.MESSAGE_UNSEND_WINDOW_HOURS * 60 * MINUTE;
  const run = (mutation, variables) => mutation.mutate(variables, { onSuccess: close });

  const choose = (emoji) =>
    emoji === myReaction ? run(unreact, message.id) : run(react, { id: message.id, emoji });

  return (
    <Dialog open={Boolean(message)} onClose={close} title="Message">
      {message && (
        <div className="flex flex-col gap-3">
          {!unsent && (
            <p className="line-clamp-3 rounded-lg bg-surface-muted px-3 py-2 text-sm whitespace-pre-wrap text-text">
              {messageSummary(message)}
            </p>
          )}
          {error && <Alert tone="error">{error.message}</Alert>}

          {!unsent && canMessage && (
            <div className="flex items-center justify-between gap-1" aria-label="React">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={emoji === myReaction}
                  aria-label={emoji === myReaction ? `Remove ${emoji} reaction` : `React ${emoji}`}
                  onClick={() => choose(emoji)}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-full text-2xl hover:bg-surface-hover',
                    emoji === myReaction && 'bg-primary-soft ring-2 ring-primary',
                  )}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                aria-label="More reactions"
                aria-expanded={picking}
                onClick={() => setPicking((open) => !open)}
                className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-hover"
              >
                <SmilePlus aria-hidden="true" className="size-6" />
              </button>
            </div>
          )}
          {picking && <EmojiPicker onSelect={choose} />}

          <div className="flex flex-col">
            {!unsent && canMessage && (
              <ActionButton
                icon={Reply}
                label="Reply"
                onClick={() => {
                  onReply(message);
                  close();
                }}
              />
            )}
            {!unsent && message.text && (
              <ActionButton
                icon={Copy}
                label="Copy text"
                onClick={async () => {
                  await navigator.clipboard?.writeText(message.text);
                  showToast('Copied');
                  close();
                }}
              />
            )}
            {canEdit && (
              <ActionButton
                icon={Pencil}
                label="Edit"
                onClick={() => {
                  onEdit(message);
                  close();
                }}
              />
            )}
            {!unsent && (
              <ActionButton
                icon={message.pinnedAt ? PinOff : Pin}
                label={message.pinnedAt ? 'Unpin' : 'Pin'}
                disabled={pin.isPending}
                onClick={() => run(pin, { id: message.id, pinned: Boolean(message.pinnedAt) })}
              />
            )}
            <ActionButton
              icon={Trash2}
              label="Delete for me"
              disabled={deleteForMe.isPending}
              onClick={() =>
                run(deleteForMe, { id: message.id, conversationId: message.conversationId })
              }
            />
            {canUnsend && (
              <ActionButton
                icon={Undo2}
                tone="danger"
                label={confirmUnsend ? 'Tap again to unsend for everyone' : 'Unsend for everyone'}
                disabled={unsend.isPending}
                onClick={() => (confirmUnsend ? run(unsend, message.id) : setConfirmUnsend(true))}
              />
            )}
          </div>
          {canUnsend && (
            <p className="text-xs text-muted">
              Unsending removes the message for both of you. Notifications already shown can’t be
              taken back.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
