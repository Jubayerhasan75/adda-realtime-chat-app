import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../lib/cn.js';

const TONES = {
  error: { Icon: AlertCircle, classes: 'border-danger/40 text-danger', role: 'alert' },
  success: { Icon: CheckCircle2, classes: 'border-success/40 text-success', role: 'status' },
  info: { Icon: Info, classes: 'border-border text-muted', role: 'status' },
};

/** Inline message for form results. Errors are announced immediately (role="alert"). */
export function Alert({ tone = 'info', children, className }) {
  const { Icon, classes, role } = TONES[tone];
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-md border bg-surface px-3 py-2.5 text-sm',
        classes,
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-text">{children}</div>
    </div>
  );
}
