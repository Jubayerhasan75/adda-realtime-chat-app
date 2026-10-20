import { LIMITS } from '@chat/shared';
import { ChevronDown, Pencil, Tag } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { TextField } from '../../../components/ui/TextField.jsx';
import { useSession } from '../../auth/api.js';
import { useSetNickname } from '../api.js';

function NicknameRow({ conversation, person, isMe }) {
  const setNickname = useSetNickname();
  const current = conversation.nicknameMap?.[person.id] ?? '';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const save = (nickname) =>
    setNickname.mutate(
      { conversationId: conversation.id, userId: person.id, nickname },
      { onSuccess: () => setEditing(false) },
    );

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-3">
        <Avatar name={person.displayName} src={person.avatar} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-text">
            {current || person.displayName}
          </span>
          <span className="block truncate text-xs text-muted">
            {current ? person.displayName : 'Set nickname'}
            {isMe && ' · you'}
          </span>
        </span>
        {!editing && (
          <button
            type="button"
            aria-label={`Edit nickname for ${isMe ? 'yourself' : person.displayName}`}
            onClick={() => {
              setValue(current);
              setEditing(true);
            }}
            className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-hover"
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      {editing && (
        <form
          noValidate
          className="flex flex-col gap-2 pl-11"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) save(value.trim());
          }}
        >
          <TextField
            label={`Nickname for ${isMe ? 'you' : person.displayName}`}
            maxLength={LIMITS.DISPLAY_NAME_MAX}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              loading={setNickname.isPending}
              disabled={!value.trim()}
            >
              Save
            </Button>
            {current && (
              <Button size="sm" variant="ghost" onClick={() => save(null)}>
                Remove nickname
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {setNickname.isError && <Alert tone="error">{setNickname.error.message}</Alert>}
        </form>
      )}
    </li>
  );
}

/** Nicknames in this chat (end-to-end encrypted; everyone in the chat sees them). */
export function Nicknames({ conversation }) {
  const me = useSession().data.user;
  const [open, setOpen] = useState(false);
  const people = conversation.group
    ? conversation.group.members
    : [me, conversation.peer].filter(Boolean);
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-surface-hover"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-amber-600 text-white">
          <Tag aria-hidden="true" className="size-4" />
        </span>
        <span className="flex-1 text-[15px] font-medium text-text">Nicknames</span>
        <ChevronDown
          aria-hidden="true"
          className={open ? 'size-5 rotate-180 text-subtle' : 'size-5 text-subtle'}
        />
      </button>
      {open && (
        <ul aria-label="Nicknames" className="flex flex-col divide-y divide-border">
          {people.map((person) => (
            <NicknameRow
              key={person.id}
              conversation={conversation}
              person={person}
              isMe={person.id === me.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
