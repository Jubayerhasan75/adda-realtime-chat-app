import { userSearchSchema } from '@chat/shared';
import { Radio, SearchX, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SearchField } from '../../components/ui/SearchField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { cn } from '../../lib/cn.js';
import { PageLayout } from '../../layouts/PageLayout.jsx';
import { useOnlineIds } from '../realtime/presenceStore.js';
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
    <div className="flex flex-col gap-3 py-4" aria-label="Loading">
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  );
}

function QueryError({ query }) {
  return (
    <Alert tone="error" className="mt-4">
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

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'requests', label: 'Requests' },
  { id: 'friends', label: 'Friends' },
];

/** Messenger-style section switcher (Active · Requests · Friends), kept in the URL. */
function Tabs({ current, counts, onChange }) {
  return (
    <div role="tablist" aria-label="People" className="mt-3 flex gap-2">
      {TABS.map((tab) => {
        const selected = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full px-4 text-sm transition-colors duration-(--duration-fast)',
              selected
                ? 'bg-primary font-semibold text-on-primary'
                : 'bg-surface-muted font-medium text-text hover:bg-surface-hover',
            )}
          >
            {tab.label}
            {counts[tab.id] > 0 && (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-xs font-semibold',
                  selected ? 'bg-surface text-link' : 'bg-primary text-on-primary',
                )}
              >
                {counts[tab.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Friends who are online right now (as their privacy settings allow). */
function ActiveNow({ onOpen }) {
  const friends = useFriends();
  const online = useOnlineIds();
  if (friends.isPending) return <ListSkeleton />;
  if (friends.isError) return <QueryError query={friends} />;
  const active = friends.data.filter(({ user }) => online.has(user.id));
  if (active.length === 0) {
    return (
      <EmptyState
        icon={<Radio aria-hidden="true" className="size-6" />}
        title="No one is active right now"
        description="Friends who are online show up here. Some people hide their online status."
      />
    );
  }
  return (
    <Section title="Active now" count={active.length}>
      <ul aria-label="Active now">
        {active.map(({ user }) => (
          <PersonRow key={user.id} user={user} onOpen={onOpen}>
            <MessageButton user={user} />
          </PersonRow>
        ))}
      </ul>
    </Section>
  );
}

function Requests({ onOpen }) {
  const incoming = useFriendRequests('incoming');
  const outgoing = useFriendRequests('outgoing');
  if (incoming.isPending) return <ListSkeleton />;
  if (incoming.isError) return <QueryError query={incoming} />;
  if (incoming.data.length === 0 && !outgoing.data?.length) {
    return (
      <EmptyState
        icon={<UserPlus aria-hidden="true" className="size-6" />}
        title="No friend requests"
        description="When someone sends you a friend request, it shows up here."
      />
    );
  }
  return (
    <>
      {incoming.data.length > 0 && (
        <Section title="Friend requests" count={incoming.data.length}>
          <ul aria-label="Friend requests">
            {incoming.data.map(({ id, user }) => (
              <PersonRow key={id} user={user} onOpen={onOpen}>
                <RelationshipActions user={user} relationship="incoming" />
              </PersonRow>
            ))}
          </ul>
        </Section>
      )}
      {outgoing.data?.length > 0 && (
        <Section title="Sent requests" count={outgoing.data.length}>
          <ul aria-label="Sent requests">
            {outgoing.data.map(({ id, user }) => (
              <PersonRow key={id} user={user} onOpen={onOpen}>
                <RelationshipActions user={user} relationship="outgoing" />
              </PersonRow>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function AllFriends({ onOpen }) {
  const friends = useFriends();
  const blocked = useBlockedUsers();
  return (
    <>
      <Section title="All friends" count={friends.data?.length ?? 0}>
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

/** While searching: my friends whose name or username matches, then everyone found by username. */
function Search({ q, onOpen }) {
  const friends = useFriends();
  const needle = q.toLocaleLowerCase();
  const matches = (friends.data ?? []).filter(
    ({ user }) =>
      user.displayName.toLocaleLowerCase().includes(needle) || user.username.includes(needle),
  );
  return (
    <>
      {matches.length > 0 && (
        <Section title="Your friends" count={matches.length}>
          <ul aria-label="Matching friends">
            {matches.map(({ user }) => (
              <PersonRow key={user.id} user={user} onOpen={onOpen}>
                <MessageButton user={user} />
              </PersonRow>
            ))}
          </ul>
        </Section>
      )}
      <Section title="People">
        <SearchResults q={q} onOpen={onOpen} />
      </Section>
    </>
  );
}

const PANELS = { active: ActiveNow, requests: Requests, friends: AllFriends };

/**
 * People, like Messenger: search on top (friends by name, anyone by username), then three
 * sections — who's active now, friend requests, and all friends.
 */
export function FriendsPage() {
  const [params, setParams] = useSearchParams();
  const tab = PANELS[params.get('tab')] ? params.get('tab') : 'active';
  const [query, setQuery] = useState('');
  const [openUsername, setOpenUsername] = useState(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const openProfile = (user) => setOpenUsername(user.username);
  const friends = useFriends();
  const incoming = useFriendRequests('incoming');
  const online = useOnlineIds();
  const counts = {
    active: friends.data?.filter(({ user }) => online.has(user.id)).length ?? 0,
    requests: incoming.data?.length ?? 0,
  };
  const Panel = PANELS[tab];

  return (
    <PageLayout title="Friends">
      <SearchField
        label="Search people by username"
        placeholder="Search friends or find people"
        value={query}
        onChange={setQuery}
      />
      {debouncedQuery ? (
        <Search q={debouncedQuery} onOpen={openProfile} />
      ) : (
        <>
          <Tabs
            current={tab}
            counts={counts}
            onChange={(next) =>
              setParams(next === 'active' ? {} : { tab: next }, { replace: true })
            }
          />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            <Panel onOpen={openProfile} />
          </div>
        </>
      )}
      <ProfileDialog username={openUsername} onClose={() => setOpenUsername(null)} />
    </PageLayout>
  );
}
