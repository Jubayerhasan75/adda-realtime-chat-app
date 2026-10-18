import { z } from 'zod';
import { LIMITS } from '../limits.js';
import {
  currentPasswordField,
  displayNameField,
  emailField,
  emailTokenField,
  newPasswordField,
  passwordContainsIdentity,
  usernameField,
} from './fields.js';

const IDENTITY_MESSAGE = 'Your password must not contain your username or email';

export const registerSchema = z
  .strictObject({
    email: emailField,
    username: usernameField,
    displayName: displayNameField,
    password: newPasswordField,
  })
  .refine((data) => !passwordContainsIdentity(data.password, data), {
    path: ['password'],
    message: IDENTITY_MESSAGE,
  });

export const loginSchema = z.strictObject({
  // Email or username; normalized the same way both are stored.
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter your email or username')
    .max(LIMITS.EMAIL_MAX),
  password: currentPasswordField,
});

export const emailTokenSchema = z.strictObject({ token: emailTokenField });

export const forgotPasswordSchema = z.strictObject({ email: emailField });

export const resetPasswordSchema = z.strictObject({
  token: emailTokenField,
  newPassword: newPasswordField,
});

export const changePasswordSchema = z
  .strictObject({ currentPassword: currentPasswordField, newPassword: newPasswordField })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one',
  });

export const changeEmailSchema = z.strictObject({
  newEmail: emailField,
  password: currentPasswordField,
});
