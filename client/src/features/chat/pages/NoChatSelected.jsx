import { MessagesSquare } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';

/** Desktop right pane when no conversation is open. Phones show the list instead. */
export function NoChatSelected() {
  return (
    <div className="flex flex-1 items-center justify-center bg-chat-bg">
      <EmptyState
        icon={<MessagesSquare aria-hidden="true" className="size-6" />}
        title="Select a conversation"
        description="Choose a chat from the list to start messaging."
      />
    </div>
  );
}
