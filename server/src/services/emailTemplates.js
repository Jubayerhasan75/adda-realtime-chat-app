// Plain-text transactional emails. Plain text avoids HTML-injection risks from user-supplied
// values such as display names, and renders well in every mail client.

const SIGNATURE = '\n\nAdda\nIf you did not expect this email, you can ignore it.';

export function verifyEmailMail({ displayName, link }) {
  return {
    subject: 'Verify your email address',
    text: `Hi ${displayName},\n\nConfirm your email address to start using Adda:\n${link}\n\nThis link expires in 24 hours.${SIGNATURE}`,
  };
}

export function accountExistsMail({ loginLink, resetLink }) {
  return {
    subject: 'Someone tried to sign up with your email',
    text: `Someone (hopefully you) tried to create a Adda account with this email address, but you already have one.\n\nLog in: ${loginLink}\nForgot your password? ${resetLink}\n\nNo new account was created.${SIGNATURE}`,
  };
}

export function passwordResetMail({ link }) {
  return {
    subject: 'Reset your password',
    text: `We received a request to reset your Adda password.\n\nChoose a new password:\n${link}\n\nThis link expires in 30 minutes. Resetting your password signs you out on all devices.${SIGNATURE}`,
  };
}

export function confirmEmailChangeMail({ displayName, link }) {
  return {
    subject: 'Confirm your new email address',
    text: `Hi ${displayName},\n\nConfirm this address as the new email for your Adda account:\n${link}\n\nThis link expires in 24 hours.${SIGNATURE}`,
  };
}

export function emailChangeRequestedNotice({ displayName, newEmail }) {
  return {
    subject: 'Your email address is being changed',
    text: `Hi ${displayName},\n\nA request was made to change your Adda email to ${newEmail}. It only takes effect after the new address is confirmed.\n\nIf this wasn't you, change your password now and sign out other sessions in Settings → Security.${SIGNATURE}`,
  };
}

export function passwordChangedNotice({ displayName }) {
  return {
    subject: 'Your password was changed',
    text: `Hi ${displayName},\n\nYour Adda password was just changed and your other sessions were signed out.\n\nIf this wasn't you, reset your password immediately using "Forgot password" on the login page.${SIGNATURE}`,
  };
}

export function encryptionResetNotice({ displayName }) {
  return {
    subject: 'Your encryption key was reset',
    text: `Hi ${displayName},

Your Adda end-to-end encryption key was just reset. Messages from before this can't be read on new devices, and your friends will see that your security code changed.

If this wasn't you, change your password now and sign out other sessions in Settings, then tell your friends.${SIGNATURE}`,
  };
}
