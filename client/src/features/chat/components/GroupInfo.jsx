import { LIMITS, groupNameField } from '@chat/shared';
import { Camera, Pencil, ShieldCheck, ShieldOff, UserMinus, UserPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { TextField } from '../../../components/ui/TextField.jsx';
import { cn } from '../../../lib/cn.js';
import { addGroupMembers } from '../../e2ee/groupKeys.js';
import { checkFile, uploadFile } from '../../media/upload.js';
import { groupRequests, useGroupAction } from '../api.js';
import { FriendPicker } from './FriendPicker.jsx';

/** Name and photo; admins can change both. */
function GroupHeader({ conversation, isAdmin, action }) {
  const { group, id } = conversation;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [nameError, setNameError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const saveName = (event) => {
    event.preventDefault();
    const parsed = groupNameField.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0].message);
      return;
    }
    action.mutate(() => groupRequests.rename(id, parsed.data), {
      onSuccess: () => setEditing(false),
    });
  };

  const changePhoto = async (file) => {
    const checked = checkFile(file, { imagesOnly: true });
    if (checked.error) {
      action.reset();
      setNameError(checked.error);
      return;
    }
    setUploading(true);
    try {
      const attachment = await uploadFile({
        file,
        kind: checked.kind,
        mimeType: checked.mimeType,
        purpose: 'avatar',
      });
      action.mutate(() => groupRequests.setPhoto(id, attachment.id));
    } catch (err) {
      setNameError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="relative">
        <Avatar name={group.name} src={group.photo} size="xl" />
        {isAdmin && (
          <button
            type="button"
            aria-label="Change group photo"
            disabled={uploading}
            onClick={() => inputRef.current.click()}
            className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full border-2 border-surface bg-surface-muted text-text shadow-sm hover:bg-surface-hover disabled:opacity-60"
          >
            <Camera aria-hidden="true" className="size-4" />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          data-testid="group-photo-input"
          onChange={(event) => {
            const [file] = event.target.files;
            event.target.value = '';
            if (file) changePhoto(file);
          }}
        />
      </div>
      {uploading && (
        <p role="status" className="text-sm text-muted">
          Uploading photo…
        </p>
      )}
      {editing ? (
        <form noValidate onSubmit={saveName} className="flex w-full flex-col gap-2 text-left">
          <TextField
            label="Group name"
            maxLength={LIMITS.GROUP_NAME_MAX}
            value={name}
            error={nameError ?? undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={action.isPending}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setName(group.name);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <h3 className="text-lg font-semibold text-text">{group.name}</h3>
          {isAdmin && (
            <button
              type="button"
              aria-label="Rename group"
              onClick={() => setEditing(true)}
              className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-hover"
            >
              <Pencil aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      )}
      {!editing && nameError && <Alert tone="error">{nameError}</Alert>}
      <p className="text-sm text-muted">
        Group · {group.members.length} members · end-to-end encrypted
      </p>
    </div>
  );
}

/** One member; admins tap someone else to manage them. */
function MemberRow({ member, conversation, currentUserId, isAdmin, action }) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isMe = member.id === currentUserId;
  const manageable = isAdmin && !isMe;
  const content = (
    <>
      <Avatar name={member.displayName} src={member.avatar} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-text">
          {isMe ? 'You' : member.displayName}
        </span>
        {member.username && (
          <span className="block truncate text-xs text-muted">@{member.username}</span>
        )}
      </span>
      {member.role === 'admin' && (
        <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-link">
          Admin
        </span>
      )}
    </>
  );
  return (
    <li className="flex flex-col">
      {manageable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value);
            setConfirmRemove(false);
          }}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-hover"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-2 py-2">{content}</div>
      )}
      {open && (
        <div className="mb-2 ml-13 flex flex-wrap gap-2">
          {member.role === 'admin' ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                action.mutate(() => groupRequests.setRole(conversation.id, member.id, 'member'))
              }
            >
              <ShieldOff aria-hidden="true" className="size-4" />
              Remove as admin
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                action.mutate(() => groupRequests.setRole(conversation.id, member.id, 'admin'))
              }
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              Make admin
            </Button>
          )}
          <Button
            size="sm"
            variant={confirmRemove ? 'danger' : 'ghost'}
            onClick={() =>
              confirmRemove
                ? action.mutate(() => groupRequests.remove(conversation.id, member.id))
                : setConfirmRemove(true)
            }
          >
            <UserMinus aria-hidden="true" className="size-4" />
            {confirmRemove
              ? `Tap again to remove ${member.displayName.split(' ')[0]}`
              : 'Remove from group'}
          </Button>
        </div>
      )}
    </li>
  );
}

/** Admins add friends; they get every group key, so they can read the whole history. */
function AddPeople({ conversation, onDone, action }) {
  const [selected, setSelected] = useState(() => new Map());
  const memberIds = new Set(conversation.group.members.map((m) => m.id));
  const room = LIMITS.GROUP_MAX_MEMBERS - memberIds.size;
  const toggle = (user) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(user.id)) next.delete(user.id);
      else next.set(user.id, user);
      return next;
    });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        New members can read the group’s earlier messages, photos and videos.
      </p>
      <FriendPicker selected={selected} onToggle={toggle} excludeIds={memberIds} max={room} />
      <div className="flex gap-2">
        <Button
          fullWidth
          disabled={selected.size === 0}
          loading={action.isPending}
          onClick={() =>
            action.mutate(() => addGroupMembers(conversation.id, [...selected.keys()]), {
              onSuccess: onDone,
            })
          }
        >
          <UserPlus aria-hidden="true" className="size-4" />
          Add {selected.size > 0 ? selected.size : ''} to group
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Group info inside the chat options: name, photo, members and admin tools. */
export function GroupInfo({ conversation, currentUserId }) {
  const action = useGroupAction();
  const [adding, setAdding] = useState(false);
  const isAdmin = conversation.group.myRole === 'admin';
  const members = [...conversation.group.members].sort(
    (a, b) =>
      (b.id === currentUserId) - (a.id === currentUserId) ||
      (b.role === 'admin') - (a.role === 'admin') ||
      a.displayName.localeCompare(b.displayName),
  );

  return (
    <div className="flex flex-col gap-4">
      <GroupHeader conversation={conversation} isAdmin={isAdmin} action={action} />
      {action.isError && <Alert tone="error">{action.error.message}</Alert>}
      {adding ? (
        <AddPeople conversation={conversation} action={action} onDone={() => setAdding(false)} />
      ) : (
        <section aria-labelledby="group-members-heading" className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h3 id="group-members-heading" className="text-sm font-semibold text-text">
              {conversation.group.members.length} members
            </h3>
            {isAdmin && conversation.group.members.length < LIMITS.GROUP_MAX_MEMBERS && (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                <UserPlus aria-hidden="true" className="size-4" />
                Add people
              </Button>
            )}
          </div>
          <ul aria-label="Members" className={cn('flex flex-col')}>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                conversation={conversation}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                action={action}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
