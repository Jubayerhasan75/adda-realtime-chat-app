import { REPORT_REASONS, reportSchema } from '@chat/shared';
import { Flag, ShieldBan, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Dialog } from '../../../components/ui/Dialog.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { inputClasses } from '../../../components/ui/TextField.jsx';
import { useForm } from '../../../hooks/useForm.js';
import { cn } from '../../../lib/cn.js';
import { useBlockUser, useProfile, useRemoveFriend, useReportUser } from '../api.js';
import { RelationshipActions } from './RelationshipActions.jsx';

const REASON_LABELS = {
  spam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  impersonation: 'Pretending to be someone else',
  inappropriate: 'Inappropriate content',
  other: 'Something else',
};

/** A destructive button that asks for a second tap before acting. */
function ConfirmButton({ icon: Icon, label, confirmLabel, pending, onConfirm }) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      variant={armed ? 'danger' : 'secondary'}
      size="sm"
      loading={pending}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      <Icon aria-hidden="true" className="size-4" />
      {armed ? confirmLabel : label}
    </Button>
  );
}

function ReportForm({ user, onDone }) {
  const report = useReportUser();
  const form = useForm(reportSchema, { reason: '', details: '' });

  if (report.isSuccess) return <Alert tone="success">{report.data.message}</Alert>;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((data) => report.mutateAsync({ userId: user.id, ...data }))}
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      {form.formError && <Alert tone="error">{form.formError}</Alert>}
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
        Why are you reporting @{user.username}?
        <select
          {...form.field('reason')}
          aria-invalid={form.errors.reason ? true : undefined}
          className={cn(inputClasses, form.errors.reason ? 'border-danger' : 'border-border')}
        >
          <option value="">Choose a reason</option>
          {REPORT_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {REASON_LABELS[reason]}
            </option>
          ))}
        </select>
        {form.errors.reason && (
          <span className="font-normal text-danger">{form.errors.reason}</span>
        )}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-text">
        Details (optional)
        <textarea
          {...form.field('details')}
          rows={3}
          maxLength={1000}
          className={cn(inputClasses, 'h-auto border-border py-2')}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={report.isPending}>
          Send report
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Someone's public profile with friendship, block and report actions. */
export function ProfileDialog({ username, onClose }) {
  const profile = useProfile(username);
  const remove = useRemoveFriend();
  const block = useBlockUser();
  const [reporting, setReporting] = useState(false);
  const data = profile.data;

  return (
    <Dialog open={Boolean(username)} onClose={onClose} title="Profile">
      {profile.isPending && (
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-24 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
      )}
      {profile.isError && <Alert tone="error">{profile.error.message}</Alert>}
      {data && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-1 text-center">
            <Avatar name={data.user.displayName} src={data.user.avatar} size="xl" />
            <p className="mt-2 text-lg font-semibold text-text">{data.user.displayName}</p>
            <p className="text-sm text-muted">@{data.user.username}</p>
            {data.user.bio && <p className="mt-2 text-sm text-text">{data.user.bio}</p>}
          </div>

          {data.relationship !== 'self' && (
            <>
              <div className="flex justify-center">
                <RelationshipActions
                  user={data.user}
                  relationship={data.relationship}
                  onOpenedChat={onClose}
                />
              </div>
              <div className="flex flex-wrap justify-center gap-2 border-t border-border pt-4">
                {data.relationship === 'friends' && (
                  <ConfirmButton
                    icon={UserMinus}
                    label="Remove friend"
                    confirmLabel="Tap again to remove"
                    pending={remove.isPending}
                    onConfirm={() => remove.mutate(data.user.id)}
                  />
                )}
                {data.relationship !== 'blocked' && (
                  <ConfirmButton
                    icon={ShieldBan}
                    label="Block"
                    confirmLabel="Tap again to block"
                    pending={block.isPending}
                    onConfirm={() => block.mutate(data.user.id)}
                  />
                )}
                <Button size="sm" variant="ghost" onClick={() => setReporting(true)}>
                  <Flag aria-hidden="true" className="size-4" />
                  Report
                </Button>
              </div>
              {reporting && <ReportForm user={data.user} onDone={() => setReporting(false)} />}
              {data.relationship === 'blocked' && (
                <p className="text-center text-xs text-muted">
                  You blocked this person. They can’t find you, send you requests or message you.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
