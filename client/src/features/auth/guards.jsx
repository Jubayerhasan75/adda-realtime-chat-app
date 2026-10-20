import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { EncryptionGate } from '../e2ee/EncryptionGate.jsx';
import { RealtimeConnection } from '../realtime/RealtimeConnection.jsx';
import { useSession } from './api.js';
import { safeRedirect } from './safeRedirect.js';
import { useSyncAccountTheme } from './useSyncAccountTheme.js';

/**
 * Waiting for the session. Offline, the request is paused (not failed), so instead of an
 * endless spinner say so; it continues by itself as soon as the connection is back.
 */
function FullScreenLoading({ offline = false }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => clearTimeout(timer);
  }, []);
  if (offline) {
    return (
      <div role="status" className="flex h-full items-center justify-center bg-bg">
        <EmptyState
          icon={<WifiOff aria-hidden="true" className="size-6" />}
          title="You’re offline"
          description="Your chats will load as soon as you’re connected again."
        />
      </div>
    );
  }
  return (
    <div
      role="status"
      className="flex h-full flex-col items-center justify-center gap-2 bg-bg px-6 text-center text-muted"
    >
      <span className="flex items-center gap-2">
        <Spinner className="size-5" />
        <span>{slow ? 'Waking up the server…' : 'Loading…'}</span>
      </span>
      {slow && (
        <span className="max-w-xs text-sm">
          The server sleeps when nobody uses it for a while. Starting it again can take up to a
          minute.
        </span>
      )}
    </div>
  );
}

const SLOW_START_MS = 5_000;

/**
 * Session check failed (offline, server asleep or down): explain and offer a retry. When the
 * device comes back online it retries by itself.
 */
function SessionError({ onRetry, retrying }) {
  const offline = navigator.onLine === false;
  useEffect(() => {
    window.addEventListener('online', onRetry);
    return () => window.removeEventListener('online', onRetry);
  }, [onRetry]);

  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <EmptyState
        icon={<WifiOff aria-hidden="true" className="size-6" />}
        title={offline ? 'You’re offline' : 'Can’t reach the server'}
        description={
          offline
            ? 'Your chats will load as soon as you’re connected again.'
            : 'Check your connection. If the app was idle, the server may take up to a minute to wake up.'
        }
        action={
          <Button onClick={onRetry} loading={retrying}>
            Try again
          </Button>
        }
      />
    </div>
  );
}

/**
 * Wraps the signed-in app: waits for the session, sends visitors to /login (remembering
 * where they were going) and unverified users to the verify-email notice.
 */
export function RequireVerifiedUser() {
  const session = useSession();
  const location = useLocation();
  const user = session.data?.user;
  useSyncAccountTheme(user);

  if (session.isPending) return <FullScreenLoading offline={session.fetchStatus === 'paused'} />;
  if (session.isError)
    return <SessionError onRetry={() => session.refetch()} retrying={session.isFetching} />;
  if (!user) {
    // After a deliberate logout, a later login goes to the chats as usual. Only when the
    // session ended on its own (expired, revoked elsewhere) do we offer to return here.
    if (session.data?.signedOut) return <Navigate to="/login" replace />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!user.emailVerified) return <Navigate to="/verify-email-notice" replace />;
  return (
    <EncryptionGate user={user}>
      <RealtimeConnection userId={user.id} />
      <Outlet />
    </EncryptionGate>
  );
}

/** Pages only meaningful when signed in, even before verification (the verify notice). */
export function RequireUser() {
  const session = useSession();
  if (session.isPending) return <FullScreenLoading offline={session.fetchStatus === 'paused'} />;
  if (session.isError)
    return <SessionError onRetry={() => session.refetch()} retrying={session.isFetching} />;
  if (!session.data.user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Login/registration pages: signed-in users continue to the page they originally asked for
 * (`?next=`, same-site paths only) or to their chats. This is the only place that redirects
 * after login, so there is no race with the login form.
 */
export function RedirectIfSignedIn() {
  const session = useSession();
  const [searchParams] = useSearchParams();
  if (session.isPending) return <FullScreenLoading offline={session.fetchStatus === 'paused'} />;
  if (session.data?.user) return <Navigate to={safeRedirect(searchParams.get('next'))} replace />;
  // If the session check failed we still show the form; submitting will surface the error.
  return <Outlet />;
}
