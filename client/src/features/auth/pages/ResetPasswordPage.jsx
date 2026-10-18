import { LIMITS, newPasswordField } from '@chat/shared';
import { Link } from 'react-router';
import { z } from 'zod';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { PasswordField } from '../../../components/ui/PasswordField.jsx';
import { useForm } from '../../../hooks/useForm.js';
import { AuthLayout } from '../../../layouts/AuthLayout.jsx';
import { useAuthAction } from '../api.js';
import { useEmailLinkToken } from '../useEmailLinkToken.js';

const formSchema = z.strictObject({ newPassword: newPasswordField });

export function ResetPasswordPage() {
  const token = useEmailLinkToken();
  const reset = useAuthAction('reset-password');
  const form = useForm(formSchema, { newPassword: '' });

  return (
    <AuthLayout title="Choose a new password" subtitle="You’ll be signed out on all devices.">
      {reset.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success">{reset.data.message}</Alert>
          <Link
            to="/login"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary font-medium text-on-primary hover:bg-primary-hover"
          >
            Log in
          </Link>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={form.handleSubmit((data) => reset.mutateAsync({ token, ...data }))}
          className="flex flex-col gap-4"
        >
          {!token && (
            <Alert tone="error">
              This link is incomplete.{' '}
              <Link to="/forgot-password" className="underline">
                Request a new one
              </Link>
              .
            </Alert>
          )}
          {form.formError && <Alert tone="error">{form.formError}</Alert>}
          <PasswordField
            label="New password"
            autoComplete="new-password"
            hint={`At least ${LIMITS.PASSWORD_MIN} characters.`}
            {...form.field('newPassword')}
          />
          <Button type="submit" disabled={!token} loading={reset.isPending} fullWidth>
            Save new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
