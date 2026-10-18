import { Check, Users } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { SearchField } from '../../../components/ui/SearchField.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { cn } from '../../../lib/cn.js';
import { useFriends } from '../../friends/api.js';

/**
 * Choose friends (for a new group, or to add to one): search by name, tap to select. Selected
 * people show as removable chips on top.
 * @param {{ selected: Map<string, object>, onToggle: (user: object) => void,
 *   excludeIds?: Set<string>, max?: number }} props
 */
export function FriendPicker({ selected, onToggle, excludeIds = new Set(), max = Infinity }) {
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const list = (friends.data ?? [])
    .map(({ user }) => user)
    .filter((user) => !excludeIds.has(user.id))
    .filter(
      (user) =>
        !needle ||
        user.displayName.toLocaleLowerCase().includes(needle) ||
        user.username.includes(needle),
    );
  const full = selected.size >= max;

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <ul aria-label="Selected" className="flex flex-wrap gap-2">
          {[...selected.values()].map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => onToggle(user)}
                aria-label={`Remove ${user.displayName}`}
                className="flex items-center gap-1.5 rounded-full bg-primary-soft py-1 pr-3 pl-1 text-sm text-text"
              >
                <Avatar name={user.displayName} src={user.avatar} size="sm" />
                {user.displayName.split(' ')[0]}
                <span aria-hidden="true" className="text-muted">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <SearchField
        label="Search friends"
        placeholder="Search friends"
        value={query}
        onChange={setQuery}
      />
      {friends.isPending && (
        <div className="flex flex-col gap-3" aria-label="Loading">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      )}
      {friends.data && list.length === 0 && (
        <EmptyState
          icon={<Users aria-hidden="true" className="size-6" />}
          title={needle ? 'No matching friends' : 'No friends to add'}
          description={
            needle ? `Nobody matches “${query.trim()}”.` : 'Only your friends can be added.'
          }
        />
      )}
      <ul aria-label="Friends" className="flex flex-col">
        {list.map((user) => {
          const isSelected = selected.has(user.id);
          return (
            <li key={user.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                disabled={!isSelected && full}
                onClick={() => onToggle(user)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-hover active:bg-surface-active disabled:opacity-50"
              >
                <Avatar name={user.displayName} src={user.avatar} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text">{user.displayName}</span>
                  <span className="block truncate text-sm text-muted">@{user.username}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                    isSelected ? 'border-primary bg-primary text-on-primary' : 'border-subtle',
                  )}
                >
                  {isSelected && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
