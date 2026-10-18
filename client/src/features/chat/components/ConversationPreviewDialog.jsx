import { EyeOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Dialog } from '../../../components/ui/Dialog.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { cn } from '../../../lib/cn.js';
import { formatTime } from '../../../lib/format.js';
import { GifImage, MediaGrid } from '../../media/components/MediaGrid.jsx';
import { useConversationPreview, useDeleteChat } from '../api.js';
import { messageSummary } from '../lib/messageSummary.js';

/**
 * Long-press peek at the latest messages (docs/REQUIREMENTS.md §8). It loads them with the
 * side-effect-free history endpoint and never reports them as read, so the sender doesn't see
 * "Seen" and the unread count stays. Only "Open chat" applies the normal read rules.
 * Photos, videos and GIFs show as small previews. "Delete chat" removes it from my list only.
 */
export function ConversationPreviewDialog({ conversation, currentUserId, onClose }) {
  const preview = useConversationPreview(conversation?.id);
  const navigate = useNavigate();
  const deleteChat = useDeleteChat();
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    setConfirming(false);
    onClose();
  };

  return (
    <Dialog
      open={Boolean(conversation)}
      onClose={close}
      title={conversation?.peer.displayName ?? ''}
    >
      {conversation && (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <EyeOff aria-hidden="true" className="size-3.5" />
            Peeking doesn’t mark messages as seen.
          </p>
          <div className="flex min-h-32 flex-col justify-end gap-1.5 rounded-lg bg-chat-bg p-3">
            {preview.isPending && (
              <span
                role="status"
                className="flex items-center justify-center gap-2 text-sm text-muted"
              >
                <Spinner /> Loading…
              </span>
            )}
            {preview.isError && <Alert tone="error">{preview.error.message}</Alert>}
            {preview.data?.messages.map((message) => {
              const isOwn = message.senderId === currentUserId;
              const hasMedia = !message.unsentAt && (message.attachments?.length || message.gif);
              return (
                <div
                  key={message.id}
                  className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}
                >
                  {hasMedia && (
                    // Look only: opening a photo here would count as reading the chat.
                    <div className="pointer-events-none origin-top scale-90" aria-hidden="true">
                      {message.attachments?.length > 0 && (
                        <MediaGrid attachments={message.attachments} onOpen={() => {}} />
                      )}
                      {message.gif && <GifImage gif={message.gif} />}
                    </div>
                  )}
                  <p
                    className={cn(
                      'max-w-[85%] rounded-bubble px-3 py-1.5 text-sm whitespace-pre-wrap break-words',
                      isOwn ? 'bg-bubble-out text-on-bubble-out' : 'bg-bubble-in text-on-bubble-in',
                    )}
                  >
                    {message.unsentAt ? <em>Message unsent</em> : messageSummary(message)}
                    <span className="ml-2 text-[11px] opacity-70">
                      {formatTime(new Date(message.createdAt))}
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button
              fullWidth
              onClick={() => {
                close();
                navigate(`/chats/${conversation.id}`);
              }}
            >
              Open chat
            </Button>
            <Button fullWidth variant="secondary" onClick={close}>
              Close
            </Button>
          </div>
          <Button
            fullWidth
            variant={confirming ? 'danger' : 'ghost'}
            loading={deleteChat.isPending}
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              deleteChat.mutate(conversation.id, { onSuccess: close });
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {confirming ? 'Tap again to delete this chat' : 'Delete chat'}
          </Button>
          {confirming && (
            <p className="text-xs text-muted">
              Removes the chat and its messages from your list only. {conversation.peer.displayName}{' '}
              keeps theirs.
            </p>
          )}
          {deleteChat.isError && <Alert tone="error">{deleteChat.error.message}</Alert>}
        </div>
      )}
    </Dialog>
  );
}
