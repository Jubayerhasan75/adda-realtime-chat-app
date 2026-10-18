import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCloseOnBack } from '../../../hooks/useCloseOnBack.js';
import { localPreview } from '../localPreviews.js';
import { showToast } from '../../../lib/toast.js';
import { downloadMedia, mediaUrl } from '../upload.js';

const SWIPE_PX = 50;

function ViewerItem({ attachment }) {
  const local = localPreview(attachment.id);
  if (attachment.kind === 'video') {
    return (
      <video
        key={attachment.id}
        src={local ?? mediaUrl(attachment.id, 'full')}
        poster={local ? undefined : mediaUrl(attachment.id, 'poster')}
        controls
        autoPlay
        playsInline
        className="max-h-full max-w-full"
      />
    );
  }
  return (
    <img
      key={attachment.id}
      src={local ?? mediaUrl(attachment.id, 'full')}
      alt="Photo"
      className="max-h-full max-w-full object-contain select-none"
      draggable={false}
    />
  );
}

/**
 * Full-screen photo/video viewer. Swipe, arrow buttons or ←/→ move between the message's
 * items; ✕, Escape, a tap outside or the phone's back button close it.
 * @param {{ items: object[] | null, startIndex?: number, onClose: () => void }} props
 */
export function MediaViewer({ items, startIndex = 0, onClose }) {
  const ref = useRef(null);
  const open = Boolean(items?.length);
  const [index, setIndex] = useState(startIndex);
  const [openedFor, setOpenedFor] = useState(items);
  const swipeStart = useRef(null);
  useCloseOnBack(open, onClose);

  // A new set of items starts at the tapped one (state adjusted during render, not in an effect).
  if (openedFor !== items) {
    setOpenedFor(items);
    setIndex(startIndex);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const count = items?.length ?? 0;
  const go = (step) => setIndex((current) => Math.min(count - 1, Math.max(0, current + step)));
  const current = items?.[Math.min(index, count - 1)];

  return (
    <dialog
      ref={ref}
      aria-label={current?.kind === 'video' ? 'Video' : 'Photo'}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(1);
        if (event.key === 'ArrowLeft') go(-1);
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      {open && current && (
        <div
          className="relative flex size-full items-center justify-center"
          onClick={(event) => event.target === event.currentTarget && onClose()}
          onPointerDown={(event) => {
            swipeStart.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (swipeStart.current === null) return;
            const moved = event.clientX - swipeStart.current;
            swipeStart.current = null;
            if (Math.abs(moved) > SWIPE_PX) go(moved < 0 ? 1 : -1);
          }}
        >
          <ViewerItem attachment={current} />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
            <span className="text-sm tabular-nums" aria-live="polite">
              {count > 1 ? `${index + 1} / ${count}` : ''}
            </span>
            <span className="flex items-center gap-1">
              {!current.pending && (
                <button
                  type="button"
                  onClick={() => {
                    downloadMedia([current.id]);
                    showToast(
                      current.kind === 'video' ? 'Downloading video…' : 'Downloading photo…',
                    );
                  }}
                  aria-label={current.kind === 'video' ? 'Download video' : 'Download photo'}
                  className="flex size-11 items-center justify-center rounded-full hover:bg-white/15"
                >
                  <Download aria-hidden="true" className="size-6" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-11 items-center justify-center rounded-full hover:bg-white/15"
              >
                <X aria-hidden="true" className="size-6" />
              </button>
            </span>
          </div>

          {index > 0 && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute left-2 flex size-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
            >
              <ChevronLeft aria-hidden="true" className="size-6" />
            </button>
          )}
          {index < count - 1 && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute right-2 flex size-11 items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
            >
              <ChevronRight aria-hidden="true" className="size-6" />
            </button>
          )}
        </div>
      )}
    </dialog>
  );
}
