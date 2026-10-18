import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button.jsx';
import { useOpenConversation } from '../../chat/api.js';

/** Opens (or creates) the conversation with a friend and goes to it. */
export function MessageButton({ user, onOpened }) {
  const open = useOpenConversation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        loading={open.isPending}
        aria-label={`Message ${user.displayName}`}
        onClick={() =>
          open.mutate(user.id, {
            onSuccess: (conversation) => {
              onOpened?.();
              navigate(`/chats/${conversation.id}`);
            },
          })
        }
      >
        <MessageCircle aria-hidden="true" className="size-4" />
        Message
      </Button>
      {open.isError && (
        <p role="alert" className="text-xs text-danger">
          {open.error.message}
        </p>
      )}
    </div>
  );
}
