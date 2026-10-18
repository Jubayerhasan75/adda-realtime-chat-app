import { useId } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * On/off setting row: a label, an optional explanation, and a switch (role="switch").
 * The whole row is the touch target.
 * @param {{ label: string, description?: string, checked: boolean,
 *   onChange: (checked: boolean) => void, disabled?: boolean }} props
 */
export function Switch({ label, description, checked, onChange, disabled = false }) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg py-2 text-left disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-text">{label}</span>
        {description && (
          <span id={descriptionId} className="block text-sm text-muted">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-(--duration-fast)',
          checked ? 'bg-primary' : 'bg-subtle',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform duration-(--duration-fast)',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  );
}
