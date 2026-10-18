import { userSearchSchema } from '@chat/shared';
import { Bell, SearchX, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SearchField } from '../../components/ui/SearchField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatListTimestamp } from '../../lib/format.js';
import { PageLayout } from '../../layouts/PageLayout.jsx';
import { useMarkAllNotificationsRead, useNotifications } from '../notifications/api.js';
import { useBlockedUsers, useFriendRequests, useFriends, useUserSearch } from './api.js';
import { MessageButton } from './components/MessageButton.jsx';
import { PersonRow } from './components/PersonRow.jsx';
import { ProfileDialog } from './components/ProfileDialog.jsx';
import { RelationshipActions } from './components/RelationshipActions.jsx';

function Section({ title, count, children }) {
  return (
    <section className="mt-6 first:mt-4">
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
        {count > 0 && <span className="ml-1.5 text-link">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-2" aria-label="Loading">
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  );
}

function QueryError({ query }) {
  return (
    <Alert tone="error">
      {query.error.message}{' '}
      <button type="button" className="underline" onClick={() => query.refetch()}>
        Try again
      </button>
    </Alert>
  );
}

function SearchResults({ q, onOpen }) {
  const valid = userSearchSchema.safeParse({ q });
  const search = useUserSearch(valid.success ? valid.data.q : '');

  if (!valid.success) return <Alert tone="info">{valid.error.issues[0].message}</Alert>;
  if (search.isPending) return <ListSkeleton />;
  if (search.isError) return <QueryError query={search} />;
  if (search.data.length === 0) {
    return (
      <EmptyState
        icon={<SearchX aria-hidden="true" className="size-6" />}
        title="No one found"
        description={`Nobody with a username starting with “${valid.data.q}”. Usernames are exact, like “nadia.r”.`}
      />
    );
  }
  return (
    <ul aria-label="Search results">
      {search.data.map(({ user, relationship }) => (
        <PersonRow key={user.id} user={user} onOpen={onOpen}>
          <RelationshipActions user={user} relationship={relationship} />
        </PersonRow>
      ))}
    </ul>
  );
}

const ACTIVITY_TEXT = {
  friend_request: 'sent you a friend request',
  friend_accepted: 'accepted your friend request',
};

function Activity({ onOpen }) {
  const notifications = useNotifications();
  const markRead = useMarkAllNotificationsRead();
  const unread = notifications.data?.unreadCount ?? 0;

  // Opening the Friends page counts as seeing the activity.
  useEffect(() => {
    // Not retried after a failure, so an outage can't cause a request loop.
    if (unread > 0 && !markRead.isPending && !markRead.isError) markRead.mutate();
  }, [unread, markRead]);

  const items = notifications.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Section title="Activity">
      <ul>
        {items.slice(0, 10).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.actor)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm hover:bg-surface-hover"
            >
              <Bell aria-hidden="true" className="size-4 shrink-0 text-link" />
              <span className="min-w-0 flex-1 text-text">
                <span className="font-medium">{item.actor.displayName}</span>{' '}
                {ACTIVITY_TEXT[item.type]}
              </span>
              <time className="shrink-0 text-xs text-subtle" dateTime={item.createdAt}>
                {formatListTimestamp(new Date(item.createdAt))}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Overview({ onOpen }) {
  const friends = useFriends();
  const incoming = useFriendRequests('incoming');
  const outgoing = useFriendRequests('outgoing');
  const blocked = useBlockedUsers();

  return (
    <>
      {incoming.data?.length > 0 && (
        <Section title="Friend requests" count={incoming.data.length}>
          <ul>
            {incoming.data.map(({ id, user }) => (
              <PersonRow key={id} user={user} onOpen={onOpen}>
                <RelationshipActions user={user} relationship="incoming" />
              </PersonRow>
            ))}
          </ul>
        </Section>
      )}

      <Activity onOpen={onOpen} />

      <Section title="Friends" count={friends.data?.length ?? 0}>
        {friends.isPending && <ListSkeleton />}
        {friends.isError && <QueryError query={friends} />}
        {friends.data?.length === 0 && (
          <EmptyState
            icon={<Users aria-hidden="true" className="size-6" />}
            title="No friends yet"
            description="Search for a friend’s username above and send them a request."
          />
        )}
        {friends.data?.length > 0 && (
          <ul aria-label="Friends">
            {friends.data.map(({ user }) => (
              <PersonRow key={user.id} user={user} onOpen={onOpen}>
                <MessageButton user={user} />
              </PersonRow>
            ))}
          </ul>
        )}
      </Section>

      {outgoing.data?.length > 0 && (
        <Section title="Sent requests" count={outgoing.data.length}>
          <ul>
            {outgoing.data.map(({ id, user }) => (
              <PersonRow key={id} user={user} onOpen={onOpen}>
                <RelationshipActions user={user} relationship="outgoing" />
              </PersonRow>
            ))}
          </ul>
        </Section>
      )}

      {blocked.data?.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted uppercase">
            Blocked <span className="ml-1">{blocked.data.length}</span>
          </summary>
          <ul className="mt-1">
            {blocked.data.map(({ user }) => (
              <PersonRow key={user.id} user={user} onOpen={onOpen}>
                <RelationshipActions user={user} relationship="blocked" />
              </PersonRow>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function FriendsPage() {
  const [query, setQuery] = useState('');
  const [openUsername, setOpenUsername] = useState(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const openProfile = (user) => setOpenUsername(user.username);

  return (
    <PageLayout title="Friends">
      <SearchField
        label="Search people by username"
        placeholder="Search by username"
        value={query}
        onChange={setQuery}
      />
      {debouncedQuery ? (
        <div className="mt-4">
          <SearchResults q={debouncedQuery} onOpen={openProfile} />
        </div>
      ) : (
        <Overview onOpen={openProfile} />
      )}
      <ProfileDialog username={openUsername} onClose={() => setOpenUsername(null)} />
    </PageLayout>
  );
}
