import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import { cn } from '../../../lib/cn.js';

/** Delivery states as defined in docs/ARCHITECTURE.md §6. */
const STATUS = {
  sending: { Icon: Clock, label: 'Sending' },
  sent: { Icon: Check, label: 'Sent' },
  delivered: { Icon: CheckCheck, label: 'Delivered' },
  seen: { Icon: CheckCheck, label: 'Seen' },
  failed: { Icon: AlertCircle, label: 'Not sent' },
};

/**
 * Seen and delivered differ by color *and* by their accessible label, so the state never
 * depends on color alone.
 * @param {{ status: keyof STATUS, className?: string }} props
 */
export function MessageStatus({ status, className }) {
  const { Icon, label } = STATUS[status];
  return (
    <span className={cn('inline-flex', className)} title={label}>
      <Icon
        aria-hidden="true"
        strokeWidth={2.25}
        className={cn(
          'size-3.5',
          status === 'seen' && 'text-receipt-seen',
          status === 'failed' && 'text-danger',
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
