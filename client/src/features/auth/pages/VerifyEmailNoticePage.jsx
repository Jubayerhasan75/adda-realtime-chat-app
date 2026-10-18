import { MailWarning } from 'lucide-react';
import { Navigate } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { AuthLayout } from '../../../layouts/AuthLayout.jsx';
import { DevMailboxHint } from '../../dev/DevMailboxHint.jsx';
import { useAuthAction, useLogout, useSession } from '../api.js';

/** Shown to signed-in users whose email isn't verified yet (docs/REQUIREMENTS.md D2). */
export function VerifyEmailNoticePage() {
  const session = useSession();
  const resend = useAuthAction('resend-verification');
  const logout = useLogout();
  const user = session.data?.user;

  if (user?.emailVerified) return <Navigate to="/chats" replace />;

  return (
    <AuthLayout title="Verify your email" subtitle={user && `We sent a link to ${user.email}.`}>
      <div className="flex flex-col gap-4">
        <div className="flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-link">
            <MailWarning aria-hidden="true" className="size-7" />
          </span>
        </div>
        <p className="text-center text-sm text-muted">
          Open the link in that email to start chatting. Check your spam folder too.
        </p>
        <DevMailboxHint />
        {resend.isSuccess && <Alert tone="success">{resend.data.message}</Alert>}
        {resend.isError && <Alert tone="error">{resend.error.message}</Alert>}
        <Button onClick={() => session.refetch()} loading={session.isFetching} fullWidth>
          I’ve verified my email
        </Button>
        <Button
          variant="secondary"
          onClick={() => resend.mutate()}
          loading={resend.isPending}
          fullWidth
        >
          Send the link again
        </Button>
        <Button
          variant="ghost"
          onClick={() => logout.mutate()}
          loading={logout.isPending}
          fullWidth
        >
          Log out
        </Button>
      </div>
    </AuthLayout>
  );
}
