import { cn } from '../../lib/cn.js';

/**
 * @param {{ icon?: React.ReactNode, title: string, description?: React.ReactNode, action?: React.ReactNode, className?: string }} props
 */
export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-link">
          {icon}
        </span>
      )}
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {description && <p className="max-w-xs text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}
