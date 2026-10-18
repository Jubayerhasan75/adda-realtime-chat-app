import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { AuthLayout } from '../../../layouts/AuthLayout.jsx';
import { SESSION_KEY, useAuthAction, useSession } from '../api.js';
import { useEmailLinkToken } from '../useEmailLinkToken.js';

const PAGES = {
  verify: {
    endpoint: 'verify-email',
    title: 'Verify your email',
    subtitle: 'Confirm that this email address belongs to you.',
    action: 'Verify my email',
  },
  'confirm-email': {
    endpoint: 'confirm-email-change',
    title: 'Confirm your new email',
    subtitle: 'Confirm this address as the new email for your account.',
    action: 'Confirm new email',
  },
};

/**
 * Landing page for verification links. The token is only used after the user presses the
 * button, so link scanners in email clients that "visit" links can't consume it.
 * @param {{ kind: keyof PAGES }} props
 */
export function EmailLinkPage({ kind }) {
  const page = PAGES[kind];
  const token = useEmailLinkToken();
  const action = useAuthAction(page.endpoint);
  const session = useSession();
  const queryClient = useQueryClient();
  const loggedIn = Boolean(session.data?.user);

  const confirm = () =>
    action.mutate(
      { token },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }) },
    );

  const next = loggedIn
    ? { to: '/chats', label: 'Go to your chats' }
    : { to: '/login', label: 'Log in' };

  return (
    <AuthLayout title={page.title} subtitle={page.subtitle}>
      <div className="flex flex-col gap-4">
        {!token && (
          <Alert tone="error">This link is incomplete. Open the link from your email again.</Alert>
        )}
        {action.isError && <Alert tone="error">{action.error.message}</Alert>}
        {action.isSuccess ? (
          <>
            <Alert tone="success">{action.data.message}</Alert>
            <Link
              to={next.to}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary font-medium text-on-primary hover:bg-primary-hover"
            >
              {next.label}
            </Link>
          </>
        ) : (
          <Button onClick={confirm} disabled={!token} loading={action.isPending} fullWidth>
            {page.action}
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
