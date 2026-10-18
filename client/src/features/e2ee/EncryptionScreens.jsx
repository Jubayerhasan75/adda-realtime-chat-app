import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordField } from '../../components/ui/PasswordField.jsx';
import { passphraseProblem } from '../../crypto/backup.js';
import { AuthLayout } from '../../layouts/AuthLayout.jsx';
import { useLogout } from '../auth/api.js';
import { MY_KEYS_KEY, resetEncryption, restoreEncryption, setUpEncryption } from './keyring.js';

function LogoutLink() {
  const logout = useLogout();
  return (
    <button type="button" className="underline" onClick={() => logout.mutate()}>
      Log out
    </button>
  );
}

/** Choose + confirm a recovery passphrase, with a strength check. */
function NewPassphraseFields({ value, confirm, onChange, onConfirmChange, showErrors }) {
  const problem = passphraseProblem(value);
  const mismatch = confirm.length > 0 && confirm !== value;
  return (
    <>
      <PasswordField
        label="Recovery passphrase"
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        hint="Tip: 4 or more random words that only you know — easy to remember, hard to guess."
        error={showErrors && problem ? problem : undefined}
      />
      <PasswordField
        label="Type it again"
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => onConfirmChange(event.target.value)}
        error={mismatch || (showErrors && confirm !== value) ? 'The two don’t match' : undefined}
      />
    </>
  );
}

/** First time on any device: turn on end-to-end encryption. */
export function SetupEncryption({ user }) {
  const queryClient = useQueryClient();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    if (passphraseProblem(passphrase) || confirm !== passphrase || !saved) return;
    setBusy(true);
    setError(null);
    try {
      await setUpEncryption(user.id, passphrase);
      await queryClient.invalidateQueries({ queryKey: MY_KEYS_KEY });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Protect your chats"
      subtitle="End-to-end encryption: only you and your friend can read your messages — not even Adda."
      footer={<LogoutLink />}
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="flex gap-2 text-sm text-text">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          Create a recovery passphrase. You’ll need it to read your messages on a new phone or after
          logging out. It never leaves this device.
        </p>
        <NewPassphraseFields
          value={passphrase}
          confirm={confirm}
          onChange={setPassphrase}
          onConfirmChange={setConfirm}
          showErrors={submitted}
        />
        <label className="flex items-start gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
            className="mt-0.5 size-4 accent-(--primary)"
          />
          <span>
            I saved it somewhere safe (a password manager or on paper). If it’s lost,{' '}
            <strong>nobody can recover my old messages</strong>.
          </span>
        </label>
        {submitted && !saved && (
          <p className="text-sm text-danger">Please confirm you saved your passphrase.</p>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy} fullWidth>
          <LockKeyhole aria-hidden="true" className="size-4" />
          {busy ? 'Securing… (a few seconds)' : 'Turn on encryption'}
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Keys exist but not on this device: unlock with the passphrase, or reset if it's lost. */
export function RestoreEncryption({ user, mine }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('unlock');
  const [passphrase, setPassphrase] = useState('');
  const [password, setPassword] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: MY_KEYS_KEY });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'reset') {
    return (
      <AuthLayout
        title="Reset encryption"
        subtitle="Only if you lost your recovery passphrase."
        footer={
          <button type="button" className="underline" onClick={() => setMode('unlock')}>
            I found my passphrase
          </button>
        }
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (!password || passphraseProblem(newPassphrase) || confirm !== newPassphrase) return;
            run(() => resetEncryption(user.id, { password, passphrase: newPassphrase }));
          }}
        >
          <Alert tone="error">
            Messages from before the reset can’t be read on this or any new device. Your friends
            will see that your security code changed.
          </Alert>
          <PasswordField
            label="Your account password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={submitted && !password ? 'Enter your password' : undefined}
          />
          <NewPassphraseFields
            value={newPassphrase}
            confirm={confirm}
            onChange={setNewPassphrase}
            onConfirmChange={setConfirm}
            showErrors={submitted}
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="danger" loading={busy} fullWidth>
            Reset encryption
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Unlock your chats"
      subtitle="Enter your recovery passphrase to read your encrypted messages on this device."
      footer={<LogoutLink />}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (passphrase) run(() => restoreEncryption(user.id, mine, passphrase));
        }}
      >
        <PasswordField
          label="Recovery passphrase"
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!passphrase} fullWidth>
          <KeyRound aria-hidden="true" className="size-4" />
          {busy ? 'Unlocking… (a few seconds)' : 'Unlock'}
        </Button>
        <button
          type="button"
          className="text-sm text-link underline"
          onClick={() => {
            setError(null);
            setMode('reset');
          }}
        >
          Forgot your passphrase?
        </button>
      </form>
    </AuthLayout>
  );
}
