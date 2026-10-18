import { Link } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';

/** Development builds only: points to the dev mailbox, since emails aren't delivered locally. */
export function DevMailboxHint() {
  if (!import.meta.env.DEV) return null;
  return (
    <Alert tone="info">
      Development mode: emails are not delivered.{' '}
      <Link to="/dev/mailbox" target="_blank" className="font-medium text-link underline">
        Open the dev mailbox
      </Link>{' '}
      to get the link.
    </Alert>
  );
}
