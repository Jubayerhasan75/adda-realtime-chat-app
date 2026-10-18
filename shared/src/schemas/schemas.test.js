import { describe, expect, it } from 'vitest';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.js';
import {
  cleanText,
  displayNameField,
  emailField,
  newPasswordField,
  usernameField,
} from './fields.js';
import { deleteAccountSchema, updateProfileSchema, updateSettingsSchema } from './user.js';

const valid = (schema, value) => schema.safeParse(value).success;
const firstIssue = (schema, value) => schema.safeParse(value).error?.issues[0]?.message;

describe('usernameField', () => {
  it.each(['abc', 'jubayer', 'nadia.r', 'user_99', 'a1b2c3d4e5f6g7h8i9j0'])(
    'accepts %s',
    (name) => {
      expect(valid(usernameField, name)).toBe(true);
    },
  );

  it('normalizes case and surrounding spaces', () => {
    expect(usernameField.parse('  Jubayer.Hasan ')).toBe('jubayer.hasan');
  });

  it.each([
    ['ab', 'too short'],
    ['a'.repeat(21), 'too long'],
    ['.nadia', 'leading dot'],
    ['nadia_', 'trailing underscore'],
    ['na..dia', 'double dot'],
    ['na._dia', 'adjacent separators'],
    ['nadia rahman', 'space'],
    ['nádia', 'non-ASCII'],
    ['admin', 'reserved'],
    ['nadia$', 'symbol'],
  ])('rejects %s (%s)', (name) => {
    expect(valid(usernameField, name)).toBe(false);
  });
});

describe('emailField', () => {
  it('lowercases and trims', () => {
    expect(emailField.parse('  Jubayer@Example.COM ')).toBe('jubayer@example.com');
  });

  it('rejects invalid and oversized addresses', () => {
    expect(valid(emailField, 'not-an-email')).toBe(false);
    expect(valid(emailField, `${'a'.repeat(250)}@x.com`)).toBe(false);
  });
});

describe('displayNameField / cleanText', () => {
  it('strips control and bidi-override characters and trims', () => {
    expect(cleanText('  Na\u0000dia\u202E ')).toBe('Nadia');
    expect(displayNameField.parse('  জুবায়ের হাসান ')).toBe('জুবায়ের হাসান');
  });

  it('rejects names that are empty after cleaning', () => {
    expect(firstIssue(displayNameField, ' \u0007 ')).toBe('Enter a display name');
  });
});

describe('newPasswordField', () => {
  it('accepts a long, uncommon password', () => {
    expect(valid(newPasswordField, 'purple-river-lamp-42')).toBe(true);
  });

  it.each(['short1!', 'Password123', 'BANGLADESH', 'aaaaaaaaaaaa', 'x'.repeat(129)])(
    'rejects %s',
    (password) => {
      expect(valid(newPasswordField, password)).toBe(false);
    },
  );
});

describe('registerSchema', () => {
  const base = {
    email: 'nadia@example.com',
    username: 'nadia',
    displayName: 'Nadia',
    password: 'purple-river-lamp-42',
  };

  it('accepts a valid registration', () => {
    expect(valid(registerSchema, base)).toBe(true);
  });

  it('rejects passwords containing the username or email name', () => {
    expect(valid(registerSchema, { ...base, password: 'my-nadia-password' })).toBe(false);
  });

  it('rejects unknown fields (no mass assignment)', () => {
    expect(valid(registerSchema, { ...base, emailVerifiedAt: new Date().toISOString() })).toBe(
      false,
    );
  });

  it('rejects operator objects instead of strings (NoSQL injection)', () => {
    expect(valid(loginSchema, { identifier: { $gt: '' }, password: 'x' })).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('requires the new password to differ from the current one', () => {
    const same = 'purple-river-lamp-42';
    expect(valid(changePasswordSchema, { currentPassword: same, newPassword: same })).toBe(false);
  });
});

describe('user schemas', () => {
  it('requires at least one profile field', () => {
    expect(valid(updateProfileSchema, {})).toBe(false);
    expect(valid(updateProfileSchema, { bio: '' })).toBe(true);
  });

  it('requires typing DELETE to delete an account', () => {
    expect(valid(deleteAccountSchema, { password: 'x', confirm: 'delete' })).toBe(false);
    expect(valid(deleteAccountSchema, { password: 'x', confirm: 'DELETE' })).toBe(true);
  });

  it('accepts partial nested settings and rejects unknown keys or values', () => {
    expect(valid(updateSettingsSchema, { privacy: { readReceipts: false } })).toBe(true);
    expect(valid(updateSettingsSchema, { theme: 'purple' })).toBe(false);
    expect(valid(updateSettingsSchema, { privacy: { isAdmin: true } })).toBe(false);
  });
});
