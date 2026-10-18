import { Avatar } from '../../../components/ui/Avatar.jsx';
import { usePresence } from '../../realtime/presenceStore.js';

/**
 * One person in a list. Tapping the name opens their profile; `children` are the actions on the
 * right (Add, Accept, …).
 */
export function PersonRow({ user, onOpen, children }) {
  const presence = usePresence(user.id);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <button
        type="button"
        onClick={() => onOpen(user)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left transition-colors duration-(--duration-fast) hover:bg-surface-hover"
      >
        <Avatar name={user.displayName} src={user.avatar} online={Boolean(presence.online)} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-text">{user.displayName}</span>
          <span className="block truncate text-sm text-muted">@{user.username}</span>
        </span>
      </button>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </li>
  );
}
