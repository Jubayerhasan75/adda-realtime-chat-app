import { Outlet, useParams } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { useMediaQuery } from '../../../hooks/useMediaQuery.js';
import { useSession } from '../../auth/api.js';
import { useConversations } from '../api.js';
import { ConversationList } from '../components/ConversationList.jsx';

export const DESKTOP_QUERY = '(min-width: 1024px)';

function ListStatus({ conversations }) {
  if (conversations.isPending) {
    return (
      <div className="flex flex-col gap-3 px-4 py-2" aria-label="Loading conversations">
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-10 flex-1" />
          </div>
        ))}
      </div>
    );
  }
  if (conversations.isError) {
    return (
      <Alert tone="error" className="mx-3">
        Couldn’t load your chats.{' '}
        <button type="button" className="underline" onClick={() => conversations.refetch()}>
          Try again
        </button>
      </Alert>
    );
  }
  return null;
}

/**
 * Chats section. Desktop shows the list and the open chat side by side; on phones the list
 * and the chat are separate full-screen views.
 */
export function ChatsPage() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { conversationId } = useParams();
  const conversations = useConversations();
  const currentUserId = useSession().data.user.id; // guaranteed by RequireVerifiedUser

  const showList = isDesktop || !conversationId;
  const showChat = isDesktop || Boolean(conversationId);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {showList && (
        <div className="flex min-h-0 w-full flex-col border-border lg:w-(--list-width) lg:shrink-0 lg:border-r">
          <ConversationList
            conversations={conversations.data ?? []}
            currentUserId={currentUserId}
            status={
              conversations.isPending || conversations.isError ? (
                <ListStatus conversations={conversations} />
              ) : null
            }
          />
        </div>
      )}
      {showChat && (
        <div className="flex min-h-0 min-w-0 flex-1">
          <Outlet context={{ isDesktop, currentUserId }} />
        </div>
      )}
    </div>
  );
}
