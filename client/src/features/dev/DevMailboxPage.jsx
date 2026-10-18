import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { apiRequest } from '../../lib/http.js';

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

/** Renders email text with links to this app turned into in-app links (others stay text). */
function EmailText({ text }) {
  return text.split(URL_PATTERN).map((part, index) => {
    if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
    const url = new URL(part);
    if (url.origin !== window.location.origin) return <Fragment key={index}>{part}</Fragment>;
    return (
      <Link
        key={index}
        to={url.pathname + url.search}
        className="break-all font-medium text-link underline"
      >
        {part}
      </Link>
    );
  });
}

/**
 * DEVELOPMENT ONLY (registered in the router only when import.meta.env.DEV). Shows the emails
 * the server would have sent, until a real email provider is configured (docs/SETUP.md step 4).
 */
export function DevMailboxPage() {
  const mailbox = useQuery({
    queryKey: ['dev', 'mailbox'],
    queryFn: ({ signal }) => apiRequest('/api/dev/mailbox', { signal }),
    refetchInterval: 3000,
  });

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-text">Dev mailbox</h1>
        <p className="mt-1 text-sm text-muted">
          Emails are not delivered in development. They appear here instead (newest first, refreshes
          every few seconds).
        </p>
        <Alert tone="info" className="mt-4">
          This page exists only in development. Configure a free email provider before deploying
          (docs/SETUP.md, step 4).
        </Alert>

        {mailbox.isError && (
          <Alert tone="error" className="mt-4">
            {mailbox.error.code === 'NOT_FOUND'
              ? 'The dev mailbox is off because the server is set up to send real email.'
              : mailbox.error.message}
          </Alert>
        )}
        {mailbox.isSuccess && mailbox.data.length === 0 && (
          <EmptyState
            icon={<Inbox aria-hidden="true" className="size-6" />}
            title="No emails yet"
            description="Register or request a reset link, and the email shows up here. The list is cleared when the server restarts."
          />
        )}
        <ul className="mt-6 flex flex-col gap-4">
          {mailbox.data?.map((mail) => (
            <li
              key={`${mail.sentAt}-${mail.to}`}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <p className="text-xs text-muted">
                To {mail.to} · {new Date(mail.sentAt).toLocaleTimeString()}
              </p>
              <h2 className="mt-1 font-semibold text-text">{mail.subject}</h2>
              <p className="mt-3 text-sm whitespace-pre-wrap text-text">
                <EmailText text={mail.text} />
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Button variant="secondary" onClick={() => mailbox.refetch()}>
            Refresh
          </Button>
        </div>
      </main>
    </div>
  );
}
