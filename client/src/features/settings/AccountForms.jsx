import {
  LIMITS,
  changeEmailSchema,
  changePasswordSchema,
  changeUsernameSchema,
  updateProfileSchema,
} from '@chat/shared';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordField } from '../../components/ui/PasswordField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useForm } from '../../hooks/useForm.js';
import { showToast } from '../../lib/toast.js';
import { useChangeEmail, useChangePassword, useChangeUsername, useUpdateProfile } from './api.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Edit page body: the fields, then one full-width button (like Messenger's edit screens). */
function EditForm({ form, onValid, pending, disabled, label = 'Save', children, onSubmit }) {
  return (
    <form
      noValidate
      onSubmit={onSubmit ?? form.handleSubmit(onValid)}
      className="flex flex-col gap-5"
    >
      {form.formError && <Alert tone="error">{form.formError}</Alert>}
      {children}
      <Button type="submit" fullWidth loading={pending} disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}

/** Saves, then goes back to the previous settings page with a short "Saved". */
function saveAndClose(mutation, onDone, message = 'Saved') {
  return async (data) => {
    await mutation.mutateAsync(data);
    showToast(message);
    onDone?.();
  };
}

export function NameForm({ user, onDone }) {
  const update = useUpdateProfile();
  const form = useForm(updateProfileSchema, { displayName: user.displayName });
  const changed = form.values.displayName.trim() !== user.displayName;
  return (
    <EditForm
      form={form}
      onValid={saveAndClose(update, onDone)}
      pending={update.isPending}
      disabled={!changed}
    >
      <TextField
        label="Name"
        autoComplete="name"
        maxLength={LIMITS.DISPLAY_NAME_MAX}
        hint="This is how your friends see you in chats."
        {...form.field('displayName')}
      />
    </EditForm>
  );
}

export function BioForm({ user, onDone }) {
  const update = useUpdateProfile();
  const form = useForm(updateProfileSchema, { bio: user.bio ?? '' });
  const changed = form.values.bio.trim() !== (user.bio ?? '');
  return (
    <EditForm
      form={form}
      onValid={saveAndClose(update, onDone)}
      pending={update.isPending}
      disabled={!changed}
    >
      <TextField
        label="Bio"
        maxLength={LIMITS.BIO_MAX}
        hint={`${form.values.bio.length}/${LIMITS.BIO_MAX} · Visible to people who can see your profile`}
        {...form.field('bio')}
      />
    </EditForm>
  );
}

export function UsernameForm({ user, onDone }) {
  const change = useChangeUsername();
  const form = useForm(changeUsernameSchema, { username: user.username });
  const nextChange = user.usernameChangedAt
    ? new Date(
        new Date(user.usernameChangedAt).getTime() + LIMITS.USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS,
      )
    : null;
  const locked = nextChange && nextChange > new Date();
  const changed = form.values.username.trim().toLowerCase() !== user.username;

  return (
    <EditForm
      form={form}
      onValid={saveAndClose(change, onDone)}
      pending={change.isPending}
      disabled={locked || !changed}
    >
      <TextField
        label="Username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={LIMITS.USERNAME_MAX}
        disabled={locked}
        hint={
          locked
            ? `You can change it again on ${nextChange.toLocaleDateString()}.`
            : `Friends find you by it. Can be changed once every ${LIMITS.USERNAME_CHANGE_COOLDOWN_DAYS} days.`
        }
        {...form.field('username')}
      />
    </EditForm>
  );
}

export function EmailForm({ user }) {
  const change = useChangeEmail();
  const form = useForm(changeEmailSchema, { newEmail: '', password: '' });

  return (
    <EditForm
      form={form}
      onValid={async (data) => {
        await change.mutateAsync(data);
        form.reset();
      }}
      pending={change.isPending}
      disabled={!form.values.newEmail || !form.values.password}
      label="Send confirmation link"
    >
      <div className="rounded-lg bg-surface-muted px-3 py-2.5">
        <p className="text-xs text-muted">Current email</p>
        <p className="truncate text-[15px] font-medium text-text">{user.email}</p>
      </div>
      {change.isSuccess && <Alert tone="success">{change.data.message}</Alert>}
      <TextField
        label="New email"
        type="email"
        autoComplete="email"
        inputMode="email"
        {...form.field('newEmail')}
      />
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        hint="To keep your account safe, confirm it’s you."
        {...form.field('password')}
      />
    </EditForm>
  );
}

export function PasswordForm({ onDone }) {
  const change = useChangePassword();
  const form = useForm(changePasswordSchema, { currentPassword: '', newPassword: '' });
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState(null);
  const save = saveAndClose(
    change,
    onDone,
    'Password changed. Your other devices were signed out.',
  );

  return (
    <EditForm
      form={form}
      pending={change.isPending}
      disabled={!form.values.currentPassword || !form.values.newPassword || !confirm}
      label="Change password"
      onSubmit={(event) => {
        if (confirm !== form.values.newPassword) {
          event.preventDefault();
          setConfirmError('The new passwords don’t match');
          return;
        }
        form.handleSubmit(save)(event);
      }}
    >
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        {...form.field('currentPassword')}
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        hint={`At least ${LIMITS.PASSWORD_MIN} characters. Your other devices will be signed out.`}
        {...form.field('newPassword')}
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        error={confirmError ?? undefined}
        onChange={(event) => {
          setConfirm(event.target.value);
          setConfirmError(null);
        }}
      />
    </EditForm>
  );
}
