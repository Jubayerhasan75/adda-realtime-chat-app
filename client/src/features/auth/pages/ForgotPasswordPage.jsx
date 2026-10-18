import { forgotPasswordSchema } from '@chat/shared';
import { Link } from 'react-router';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { TextField } from '../../../components/ui/TextField.jsx';
import { useForm } from '../../../hooks/useForm.js';
import { AuthLayout } from '../../../layouts/AuthLayout.jsx';
import { DevMailboxHint } from '../../dev/DevMailboxHint.jsx';
import { useAuthAction } from '../api.js';

export function ForgotPasswordPage() {
  const request = useAuthAction('forgot-password');
  const form = useForm(forgotPasswordSchema, { email: '' });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account’s email and we’ll send you a reset link."
      footer={
        <Link to="/login" className="font-medium text-link underline-offset-4 hover:underline">
          Back to log in
        </Link>
      }
    >
      {request.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success">{request.data.message} The link expires in 30 minutes.</Alert>
          <DevMailboxHint />
        </div>
      ) : (
        <form
          noValidate
          onSubmit={form.handleSubmit((data) => request.mutateAsync(data))}
          className="flex flex-col gap-4"
        >
          {form.formError && <Alert tone="error">{form.formError}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            {...form.field('email')}
          />
          <Button type="submit" loading={request.isPending} fullWidth>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
