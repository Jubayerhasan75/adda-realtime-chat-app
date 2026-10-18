import { Search, X } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Controlled search input with a visually hidden label and a clear button.
 * @param {{ label: string, value: string, onChange: (value: string) => void, placeholder?: string, className?: string }} props
 */
export function SearchField({ label, value, onChange, placeholder, className }) {
  const id = useId();
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-10 w-full rounded-full border border-transparent bg-surface-muted pr-9 pl-9 text-text placeholder:text-subtle focus:border-primary focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-subtle hover:text-text"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
