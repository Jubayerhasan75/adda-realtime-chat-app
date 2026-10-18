import { cn } from '../../lib/cn.js';
import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface-muted text-text hover:bg-surface-hover border border-border',
  ghost: 'bg-transparent text-text hover:bg-surface-hover',
  danger: 'bg-danger text-white hover:opacity-90',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-[15px] gap-2',
};

/**
 * @param {{ variant?: keyof VARIANTS, size?: keyof SIZES, loading?: boolean, fullWidth?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap select-none',
        'transition-[background-color,color,transform] duration-(--duration-fast) enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
