import { LIMITS, registerSchema } from '@chat/shared';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { PasswordField } from '../../../components/ui/PasswordField.jsx';
import { TextField } from '../../../components/ui/TextField.jsx';
import { useForm } from '../../../hooks/useForm.js';
import { AuthLayout } from '../../../layouts/AuthLayout.jsx';
import { DevMailboxHint } from '../../dev/DevMailboxHint.jsx';
import { useAuthAction } from '../api.js';

export function RegisterPage() {
  const register = useAuthAction('register');
  const [sentTo, setSentTo] = useState(null);
  const form = useForm(registerSchema, { displayName: '', username: '', email: '', password: '' });

  const onSubmit = form.handleSubmit(async (data) => {
    await register.mutateAsync(data);
    setSentTo(data.email);
  });

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a verification link to ${sentTo}.`}>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-link">
            <MailCheck aria-hidden="true" className="size-7" />
          </span>
          <p className="text-sm text-muted">
            Open the link to verify your account. It expires in 24 hours. You can log in now and
            verify later.
          </p>
          <DevMailboxHint />
          <Link
            to="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary font-medium text-on-primary hover:bg-primary-hover"
          >
            Continue to log in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Chat privately with the friends you choose."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-link underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <TextField
          label="Display name"
          autoComplete="name"
          maxLength={LIMITS.DISPLAY_NAME_MAX}
          {...form.field('displayName')}
        />
        <TextField
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={LIMITS.USERNAME_MAX}
          hint="Friends find you by this. Letters, numbers, dots and underscores."
          {...form.field('username')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          {...form.field('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          hint={`At least ${LIMITS.PASSWORD_MIN} characters. A short phrase is easy to remember.`}
          {...form.field('password')}
        />
        <Button type="submit" loading={register.isPending} fullWidth>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
