import { cn } from '../../lib/cn.js';

const VARIANTS = {
  ghost: 'text-muted hover:bg-surface-hover hover:text-text active:bg-surface-active',
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover',
};

const SIZES = { sm: 'size-9', md: 'size-11' };

/**
 * Icon-only button. `label` is required because the icon alone has no accessible name.
 * @param {{ label: string, variant?: keyof VARIANTS, size?: keyof SIZES } & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        'transition-[background-color,color,transform] duration-(--duration-fast) enabled:active:scale-90 disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
