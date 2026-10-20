import { useQueryClient } from '@tanstack/react-query';
import { Images, LogOut, MessageSquareX, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Dialog } from '../../../components/ui/Dialog.jsx';
import { cn } from '../../../lib/cn.js';
import {
  CHAT_KEYS,
  groupRequests,
  useClearChat,
  useDeleteChat,
  useGroupAction,
  useUpdateChatSettings,
} from '../api.js';
import { ChatAppearance } from './ChatAppearance.jsx';
import { GroupInfo } from './GroupInfo.jsx';
import { Nicknames } from './Nicknames.jsx';

const HOUR = 3600_000;
const MUTE_OPTIONS = [
  { value: 'off', label: 'Not muted' },
  { value: '8h', label: '8 hours', ms: 8 * HOUR },
  { value: '1w', label: '1 week', ms: 7 * 24 * HOUR },
  { value: 'always', label: 'Until I unmute' },
];
// "Until I unmute" is stored as a far-future date.
const FOREVER = '9999-12-31T00:00:00.000Z';

/** The "muted until" timestamp for a mute option, computed when the option is chosen. */
function mutedUntilFor(option) {
  if (option.value === 'off') return null;
  if (option.value === 'always') return FOREVER;
  return new Date(Date.now() + option.ms).toISOString();
}

function muteValue(mutedUntil, now) {
  if (!mutedUntil || new Date(mutedUntil).getTime() <= now) return 'off';
  return mutedUntil.startsWith('9999') ? 'always' : 'custom';
}

/**
 * Settings of one chat that only affect me: mute, color, clear history; plus in-chat search.
 * `openedAt` is captured when the dialog opens so "muted until" is evaluated outside rendering.
 */
export function ChatOptionsDialog({
  open,
  openedAt,
  conversation,
  currentUserId,
  onClose,
  onSearch,
  onMediaLinks,
}) {
  const update = useUpdateChatSettings();
  const clear = useClearChat();
  const [confirmClear, setConfirmClear] = useState(false);
  const deleteChat = useDeleteChat();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const leave = useGroupAction();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const queryClient = useQueryClient();
  const { peer, myState, id, group } = conversation;
  const currentMute = muteValue(myState.mutedUntil, openedAt);

  const close = () => {
    setConfirmClear(false);
    setConfirmDelete(false);
    setConfirmLeave(false);
    update.reset();
    clear.reset();
    onClose();
  };

  const setMute = (option) =>
    update.mutate({ conversationId: id, mutedUntil: mutedUntilFor(option) });

  return (
    <Dialog open={open} onClose={close} title={group ? 'Group info' : 'Chat options'}>
      <div className="flex flex-col gap-5">
        {group ? (
          <GroupInfo conversation={conversation} currentUserId={currentUserId} />
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name={peer.displayName} src={peer.avatar} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-text">{peer.displayName}</p>
              {peer.username && <p className="truncate text-sm text-muted">@{peer.username}</p>}
            </div>
          </div>
        )}
        {(update.isError || clear.isError || deleteChat.isError) && (
          <Alert tone="error">{(update.error ?? clear.error ?? deleteChat.error).message}</Alert>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            aria-label="Search in this chat"
            onClick={() => {
              close();
              onSearch();
            }}
          >
            <Search aria-hidden="true" className="size-4" />
            Search
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              close();
              onMediaLinks();
            }}
          >
            <Images aria-hidden="true" className="size-4" />
            Media and links
          </Button>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-text">Mute notifications</legend>
          <div className="grid grid-cols-2 gap-2">
            {MUTE_OPTIONS.map((option) => {
              const selected = currentMute === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2 text-sm',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)',
                    selected
                      ? 'border-primary bg-primary-soft text-text'
                      : 'border-border text-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="mute"
                    className="sr-only"
                    checked={selected}
                    onChange={() => setMute(option)}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
          {currentMute === 'custom' && (
            <p className="mt-2 text-sm text-text">
              Muted until {new Date(myState.mutedUntil).toLocaleString()}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            Only affects you: no notifications from this chat while it’s muted.
          </p>
        </fieldset>

        {(group || peer?.username) && <Nicknames conversation={conversation} />}

        <ChatAppearance
          conversation={conversation}
          currentUserId={currentUserId}
          onChange={(changes) => update.mutate(changes)}
        />

        <Button
          variant={confirmClear ? 'danger' : 'ghost'}
          loading={clear.isPending}
          onClick={() =>
            confirmClear ? clear.mutate(id, { onSuccess: close }) : setConfirmClear(true)
          }
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {confirmClear ? 'Tap again to clear this chat for you' : 'Clear chat history'}
        </Button>
        <Button
          variant={confirmDelete ? 'danger' : 'ghost'}
          loading={deleteChat.isPending}
          onClick={() =>
            confirmDelete
              ? deleteChat.mutate(id, {
                  onSuccess: () => {
                    close();
                    navigate('/chats', { replace: true });
                  },
                })
              : setConfirmDelete(true)
          }
        >
          <MessageSquareX aria-hidden="true" className="size-4" />
          {confirmDelete ? 'Tap again to delete this chat for you' : 'Delete chat'}
        </Button>
        {group && (
          <Button
            variant={confirmLeave ? 'danger' : 'ghost'}
            loading={leave.isPending}
            onClick={() =>
              confirmLeave
                ? leave.mutate(() => groupRequests.leave(id), {
                    onSuccess: () => {
                      queryClient.setQueryData(CHAT_KEYS.list, (list) =>
                        list?.filter((item) => item.id !== id),
                      );
                      close();
                      navigate('/chats', { replace: true });
                    },
                  })
                : setConfirmLeave(true)
            }
          >
            <LogOut aria-hidden="true" className="size-4" />
            {confirmLeave ? 'Tap again to leave the group' : 'Leave group'}
          </Button>
        )}
        {leave.isError && <Alert tone="error">{leave.error.message}</Alert>}
      </div>
    </Dialog>
  );
}
