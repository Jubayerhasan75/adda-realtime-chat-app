import { TextField } from './TextField.jsx';

/**
 * Password input. Passwords are never shown on screen: there is no show/hide toggle, and the
 * browser's own reveal button (Edge) is hidden in styles/index.css. Pass
 * autoComplete="new-password" for new passwords.
 */
export function PasswordField(props) {
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      {...props}
      type="password"
    />
  );
}
