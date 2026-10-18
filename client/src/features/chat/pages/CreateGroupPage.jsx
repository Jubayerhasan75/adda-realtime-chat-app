import { LIMITS, groupNameField } from '@chat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { TextField } from '../../../components/ui/TextField.jsx';
import { PageLayout } from '../../../layouts/PageLayout.jsx';
import { createGroup } from '../../e2ee/groupKeys.js';
import { openConversation } from '../../e2ee/messages.js';
import { CHAT_KEYS } from '../api.js';
import { FriendPicker } from '../components/FriendPicker.jsx';

const MIN_FRIENDS = 2;

/** New group: a name and at least two friends; the group key is made on this device. */
export function CreateGroupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [nameError, setNameError] = useState(null);

  const toggle = (user) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(user.id)) next.delete(user.id);
      else next.set(user.id, user);
      return next;
    });

  const create = async (event) => {
    event.preventDefault();
    const parsed = groupNameField.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const group = await createGroup({ name: parsed.data, memberIds: [...selected.keys()] });
      queryClient.setQueryData(CHAT_KEYS.conversation(group.id), await openConversation(group));
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations });
      navigate(`/chats/${group.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const missing = MIN_FRIENDS - selected.size;
  return (
    <PageLayout title="New group" backTo="/chats">
      <form noValidate onSubmit={create} className="flex flex-col gap-4 pb-24">
        <TextField
          label="Group name"
          placeholder="e.g. CSE 3rd year"
          maxLength={LIMITS.GROUP_NAME_MAX}
          value={name}
          error={nameError ?? undefined}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
          }}
        />
        <div>
          <h2 className="mb-2 text-sm font-semibold text-text">
            Add friends{' '}
            <span className="font-normal text-muted">
              ({selected.size}/{LIMITS.GROUP_MAX_MEMBERS - 1})
            </span>
          </h2>
          <FriendPicker selected={selected} onToggle={toggle} max={LIMITS.GROUP_MAX_MEMBERS - 1} />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface px-4 py-3">
          <Button type="submit" fullWidth loading={busy} disabled={missing > 0 || !name.trim()}>
            <Users aria-hidden="true" className="size-5" />
            {missing > 0
              ? `Choose ${missing} more friend${missing === 1 ? '' : 's'}`
              : `Create group (${selected.size + 1} people)`}
          </Button>
        </div>
      </form>
    </PageLayout>
  );
}
