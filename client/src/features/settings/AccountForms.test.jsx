import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordField } from '../../components/ui/PasswordField.jsx';
import { PasswordForm } from './AccountForms.jsx';

const renderWithQuery = (ui) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

afterEach(() => vi.unstubAllGlobals());

describe('PasswordField', () => {
  it('never shows the password: always type=password, no reveal button', () => {
    render(<PasswordField label="Password" defaultValue="secret-words" type="text" />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PasswordForm', () => {
  it('keeps Change password off until every field is filled', async () => {
    renderWithQuery(<PasswordForm />);
    const submit = screen.getByRole('button', { name: 'Change password' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Current password'), 'old-password-1');
    await userEvent.type(screen.getByLabelText('New password'), 'new-password-22');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'new-password-22');
    expect(submit).toBeEnabled();
  });

  it('stops before sending when the new passwords don’t match', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderWithQuery(<PasswordForm />);
    await userEvent.type(screen.getByLabelText('Current password'), 'old-password-1');
    await userEvent.type(screen.getByLabelText('New password'), 'new-password-22');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'new-password-23');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The new passwords don’t match')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
