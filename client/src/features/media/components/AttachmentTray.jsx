import { AlertCircle, Play, RotateCw, X } from 'lucide-react';
import { cn } from '../../../lib/cn.js';

/** Circular upload progress drawn over a thumbnail. */
function ProgressRing({ value }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden="true">
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="rgb(255 255 255 / 0.35)"
        strokeWidth="3"
      />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.max(0.04, value))}
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

/**
 * Picked photos/videos waiting to be sent, above the message box. Each shows its upload
 * progress and can be removed (✕) or retried after a failure.
 * @param {{ items: import('../useAttachmentTray.js').TrayItem[], onRemove: (id: string) => void,
 *   onRetry: (id: string) => void }} props
 */
export function AttachmentTray({ items, onRemove, onRetry }) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label="Files to send"
      className="flex gap-2 overflow-x-auto border-t border-border bg-surface px-3 pt-3 pb-1"
    >
      {items.map((item) => (
        <li key={item.localId} className="relative size-20 shrink-0">
          <div className="size-full overflow-hidden rounded-lg bg-surface-muted">
            {item.kind === 'image' ? (
              <img src={item.previewUrl} alt={item.file.name} className="size-full object-cover" />
            ) : (
              <video
                src={item.previewUrl}
                muted
                preload="metadata"
                className="size-full object-cover"
                aria-label={item.file.name}
              />
            )}
          </div>
          {item.kind === 'video' && item.status === 'ready' && (
            <Play
              aria-hidden="true"
              className="absolute bottom-1 left-1 size-4 fill-white text-white drop-shadow"
            />
          )}
          {item.status !== 'ready' && (
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center rounded-lg',
                item.status === 'failed' ? 'bg-black/60' : 'bg-black/40',
              )}
            >
              {item.status === 'uploading' ? (
                <>
                  <ProgressRing value={item.progress} />
                  <span className="sr-only" role="status">
                    Uploading {item.file.name}: {Math.round(item.progress * 100)}%
                  </span>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onRetry(item.localId)}
                  title={item.error}
                  aria-label={`Retry uploading ${item.file.name}. ${item.error ?? ''}`}
                  className="flex flex-col items-center gap-0.5 text-[11px] font-semibold text-white"
                >
                  <AlertCircle aria-hidden="true" className="size-4" />
                  <RotateCw aria-hidden="true" className="size-4" />
                  Retry
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.localId)}
            aria-label={`Remove ${item.file.name}`}
            className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-text text-surface"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
