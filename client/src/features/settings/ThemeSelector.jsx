import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { useTheme } from './useTheme.js';

const OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Radio group for the app theme. Applies and stores the choice on this device immediately;
 * `onChange` lets the caller also save it to the account.
 * @param {{ onChange?: (theme: string) => void }} props
 */
export function ThemeSelector({ onChange }) {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-text">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, Icon }) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-sm transition-colors duration-(--duration-fast)',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus-ring)',
              preference === value
                ? 'border-primary bg-primary-soft text-text'
                : 'border-border text-muted hover:bg-surface-hover',
            )}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => {
                setPreference(value);
                onChange?.(value);
              }}
              className="sr-only"
            />
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
