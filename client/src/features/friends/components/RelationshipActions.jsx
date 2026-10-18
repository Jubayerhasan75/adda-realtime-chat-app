import { Check, UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui/Button.jsx';
import {
  useAcceptRequest,
  useCancelRequest,
  useDeclineRequest,
  useFriendRequests,
  useSendFriendRequest,
  useUnblockUser,
} from '../api.js';
import { MessageButton } from './MessageButton.jsx';

/** Finds the pending request id between me and `userId` from the cached request lists. */
function useRequestIdWith(userId, direction) {
  const requests = useFriendRequests(direction);
  return requests.data?.find((request) => request.user.id === userId)?.id;
}

/**
 * The main action for a person, depending on how we relate:
 * none → Add · outgoing → Cancel · incoming → Accept/Decline · friends → Message · blocked → Unblock.
 */
export function RelationshipActions({ user, relationship, onOpenedChat }) {
  const send = useSendFriendRequest();
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const cancel = useCancelRequest();
  const unblock = useUnblockUser();
  const incomingId = useRequestIdWith(user.id, 'incoming');
  const outgoingId = useRequestIdWith(user.id, 'outgoing');
  const error = [send, accept, decline, cancel, unblock].find((m) => m.isError)?.error;

  let actions = null;
  if (relationship === 'none') {
    actions = (
      <Button size="sm" loading={send.isPending} onClick={() => send.mutate(user.id)}>
        <UserPlus aria-hidden="true" className="size-4" />
        Add
      </Button>
    );
  } else if (relationship === 'outgoing') {
    actions = (
      <Button
        size="sm"
        variant="secondary"
        disabled={!outgoingId}
        loading={cancel.isPending}
        onClick={() => cancel.mutate(outgoingId)}
        aria-label={`Cancel friend request to ${user.displayName}`}
      >
        Requested
      </Button>
    );
  } else if (relationship === 'incoming') {
    actions = (
      <>
        <Button
          size="sm"
          disabled={!incomingId}
          loading={accept.isPending}
          onClick={() => accept.mutate(incomingId)}
        >
          <Check aria-hidden="true" className="size-4" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!incomingId}
          loading={decline.isPending}
          onClick={() => decline.mutate(incomingId)}
        >
          Decline
        </Button>
      </>
    );
  } else if (relationship === 'friends') {
    actions = <MessageButton user={user} onOpened={onOpenedChat} />;
  } else if (relationship === 'blocked') {
    actions = (
      <Button
        size="sm"
        variant="secondary"
        loading={unblock.isPending}
        onClick={() => unblock.mutate(user.id)}
      >
        Unblock
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">{actions}</div>
      {error && (
        <p role="alert" className="max-w-48 text-right text-xs text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
