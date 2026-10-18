import { loginSchema } from '@chat/shared';
import { Link } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { PasswordField } from '../../../components/ui/PasswordField.jsx';
import { TextField } from '../../../components/ui/TextField.jsx';
import { useForm } from '../../../hooks/useForm.js';
import { AuthLayout } from '../../../layouts/AuthLayout.jsx';
import { useLogin } from '../api.js';

export function LoginPage() {
  const login = useLogin();
  const form = useForm(loginSchema, { identifier: '', password: '' });

  // On success the cached session gains a user and RedirectIfSignedIn moves on to `?next`.
  const onSubmit = form.handleSubmit((credentials) => login.mutateAsync(credentials));

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue your conversations."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-link underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        <TextField
          label="Email or username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...form.field('identifier')}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          {...form.field('password')}
        />
        <div className="-mt-1 text-right">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={login.isPending} fullWidth>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
