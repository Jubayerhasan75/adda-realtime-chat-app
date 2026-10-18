import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from './IconButton.jsx';
import { TextField } from './TextField.jsx';

/**
 * Password input. Hidden by default; the eye button shows only what you are typing right now.
 * Saved passwords are never loaded into these fields (they always start empty), and the
 * browser's own reveal button (Edge) is hidden in styles/index.css so there's just one.
 * Pass autoComplete="new-password" for new passwords.
 */
export function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      {...props}
      type={visible ? 'text' : 'password'}
      endAdornment={
        <IconButton
          size="sm"
          label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </IconButton>
      }
    />
  );
}
