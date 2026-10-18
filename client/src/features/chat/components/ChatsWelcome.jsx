import { MessageCirclePlus, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { useFriends } from '../../friends/api.js';
import { usePresence } from '../../realtime/presenceStore.js';
import { useOpenConversation } from '../api.js';

function FriendToChat({ user }) {
  const open = useOpenConversation();
  const navigate = useNavigate();
  const presence = usePresence(user.id);
  return (
    <li>
      <button
        type="button"
        disabled={open.isPending}
        onClick={() =>
          open.mutate(user.id, {
            onSuccess: (conversation) => navigate(`/chats/${conversation.id}`),
          })
        }
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover active:bg-surface-active disabled:opacity-60"
      >
        <Avatar name={user.displayName} src={user.avatar} online={Boolean(presence.online)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text">{user.displayName}</span>
          <span className="block truncate text-sm text-muted">Say hi 👋</span>
        </span>
        <MessageCirclePlus aria-hidden="true" className="size-5 shrink-0 text-link" />
      </button>
    </li>
  );
}

/**
 * What a new account sees instead of an empty list (like Messenger): with friends, a one-tap
 * way to start each chat; without, a friendly nudge to find friends.
 */
export function ChatsWelcome() {
  const friends = useFriends();
  const navigate = useNavigate();
  const list = friends.data ?? [];

  if (friends.isPending) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3" role="status" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-primary-soft text-link">
          <UserPlus aria-hidden="true" className="size-9" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-text">Welcome to Adda</h2>
          <p className="text-sm text-muted">
            Add your friends to start chatting. Only friends can message you, and every chat is
            end-to-end encrypted.
          </p>
        </div>
        <Button onClick={() => navigate('/friends')}>
          <UserPlus aria-hidden="true" className="size-4" />
          Find friends
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="start-chat-heading" className="px-2 py-2">
      <h2
        id="start-chat-heading"
        className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase"
      >
        Start a chat
      </h2>
      <ul>
        {list.slice(0, 20).map(({ user }) => (
          <FriendToChat key={user.id} user={user} />
        ))}
      </ul>
      <div className="px-2 pt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/friends')}>
          <UserPlus aria-hidden="true" className="size-4" />
          Find more friends
        </Button>
      </div>
    </section>
  );
}
