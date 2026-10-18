import { useId } from 'react';
import { cn } from '../../lib/cn.js';

export const inputClasses =
  'h-11 w-full rounded-md border bg-surface px-3 text-text placeholder:text-subtle focus:border-primary focus:outline-none focus-visible:outline-none disabled:opacity-60';

/**
 * Labelled text input with hint and error text wired up for screen readers.
 * @param {{ label: string, error?: string, hint?: string, endAdornment?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>} props
 */
export function TextField({ label, error, hint, endAdornment, className, id, ...inputProps }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
          className={cn(
            inputClasses,
            error ? 'border-danger' : 'border-border',
            endAdornment && 'pr-11',
          )}
          {...inputProps}
        />
        {endAdornment && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-1">{endAdornment}</span>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
