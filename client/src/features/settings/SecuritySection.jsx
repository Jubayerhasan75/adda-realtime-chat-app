import { deleteAccountSchema } from '@chat/shared';
import { Monitor, Smartphone } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordField } from '../../components/ui/PasswordField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useForm } from '../../hooks/useForm.js';
import { formatListTimestamp } from '../../lib/format.js';
import { useDeleteAccount, useRevokeOtherSessions, useRevokeSession, useSessions } from './api.js';

const isMobile = (device) => /Android|iOS/.test(device);

export function SessionsList() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  if (sessions.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading sessions">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (sessions.isError) {
    return (
      <Alert tone="error">
        Couldn’t load your sessions.{' '}
        <button type="button" className="underline" onClick={() => sessions.refetch()}>
          Try again
        </button>
      </Alert>
    );
  }

  const others = sessions.data.filter((session) => !session.current);
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border">
        {sessions.data.map((session) => {
          const Icon = isMobile(session.device) ? Smartphone : Monitor;
          return (
            <li key={session.id} className="flex items-center gap-3 py-3">
              <Icon aria-hidden="true" className="size-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">
                  {session.device}
                  {session.current && (
                    <span className="ml-2 text-xs font-semibold text-success">This device</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  Last active {formatListTimestamp(new Date(session.lastUsedAt))}
                  {session.ipPrefix && ` · network ${session.ipPrefix}`}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={revoke.isPending && revoke.variables === session.id}
                  onClick={() => revoke.mutate(session.id)}
                >
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <Button
          variant="secondary"
          size="sm"
          loading={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          Sign out all other devices
        </Button>
      )}
    </div>
  );
}

export function DeleteAccountForm() {
  const remove = useDeleteAccount();
  const form = useForm(deleteAccountSchema, { password: '', confirm: '' });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((data) => remove.mutateAsync(data))}
      className="flex flex-col gap-4"
    >
      {form.formError && <Alert tone="error">{form.formError}</Alert>}
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        {...form.field('password')}
      />
      <TextField
        label="Type DELETE to confirm"
        autoCapitalize="characters"
        autoComplete="off"
        {...form.field('confirm')}
      />
      <div>
        <Button type="submit" variant="danger" size="sm" loading={remove.isPending}>
          Delete my account permanently
        </Button>
      </div>
    </form>
  );
}
