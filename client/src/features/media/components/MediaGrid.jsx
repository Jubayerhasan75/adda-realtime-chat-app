import { ImageOff, Play } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../lib/cn.js';
import { formatDuration } from '../../../lib/format.js';
import { localPreview } from '../localPreviews.js';
import { mediaUrl } from '../upload.js';

const MAX_TILES = 4;

/** Keeps very tall or very wide media inside a sensible box (the rest is cropped). */
function aspectRatioOf({ width, height }) {
  if (!width || !height) return 4 / 3;
  return Math.min(2, Math.max(0.5, width / height));
}

/** Video thumbnail: the provider's poster frame, or the first frame of the video itself. */
function VideoThumb({ attachment, onFailed }) {
  const local = localPreview(attachment.id);
  const [posterFailed, setPosterFailed] = useState(false);
  if (local || posterFailed) {
    return (
      <video
        src={local ?? mediaUrl(attachment.id, 'full')}
        muted
        playsInline
        preload="metadata"
        onError={onFailed}
        className="size-full object-cover"
      />
    );
  }
  return (
    <img
      src={mediaUrl(attachment.id, 'poster')}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setPosterFailed(true)}
      className="size-full object-cover"
    />
  );
}

function MediaTile({ attachment, onOpen, more = 0, label }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(localPreview(attachment.id)));
  const duration = attachment.kind === 'video' ? formatDuration(attachment.durationMs) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cn(
        'relative block size-full overflow-hidden bg-black/10',
        !loaded && !failed && 'animate-pulse',
      )}
    >
      {failed ? (
        <span className="flex size-full flex-col items-center justify-center gap-1 text-xs opacity-80">
          <ImageOff aria-hidden="true" className="size-5" />
          Not available
        </span>
      ) : attachment.kind === 'image' ? (
        <img
          src={localPreview(attachment.id) ?? mediaUrl(attachment.id, 'thumb')}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'size-full object-cover transition-opacity',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : (
        <VideoThumb attachment={attachment} onFailed={() => setFailed(true)} />
      )}
      {attachment.kind === 'video' && !failed && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-black/55">
            <Play aria-hidden="true" className="ml-0.5 size-5 fill-white text-white" />
          </span>
          {duration && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {duration}
            </span>
          )}
        </span>
      )}
      {more > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">
          +{more}
        </span>
      )}
    </button>
  );
}

/**
 * Photos/videos of one message. The space is reserved from the stored width/height before
 * anything loads, so the chat never jumps. Tapping one opens the full-screen viewer.
 * @param {{ attachments: object[], onOpen: (index: number) => void }} props
 */
export function MediaGrid({ attachments, onOpen }) {
  const label = (attachment, index) =>
    `${attachment.kind === 'video' ? 'Video' : 'Photo'} ${index + 1} of ${attachments.length}. Open`;

  if (attachments.length === 1) {
    const [attachment] = attachments;
    return (
      <div
        className="w-[min(260px,62vw)] overflow-hidden rounded-[calc(var(--radius-bubble)-4px)]"
        style={{ aspectRatio: aspectRatioOf(attachment) }}
      >
        <MediaTile attachment={attachment} onOpen={() => onOpen(0)} label={label(attachment, 0)} />
      </div>
    );
  }

  const shown = attachments.slice(0, MAX_TILES);
  return (
    <div
      className={cn(
        'grid w-[min(260px,62vw)] grid-cols-2 gap-0.5 overflow-hidden rounded-[calc(var(--radius-bubble)-4px)]',
      )}
    >
      {shown.map((attachment, index) => (
        <div
          key={attachment.id}
          className={cn(
            'aspect-square',
            shown.length === 3 && index === 0 && 'col-span-2 aspect-[2/1]',
          )}
        >
          <MediaTile
            attachment={attachment}
            onOpen={() => onOpen(index)}
            label={label(attachment, index)}
            more={index === MAX_TILES - 1 ? attachments.length - MAX_TILES : 0}
          />
        </div>
      ))}
    </div>
  );
}

/** A GIF message: loaded straight from KLIPY's media host (as its terms require). */
export function GifImage({ gif }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={cn(
        'w-[min(220px,58vw)] overflow-hidden rounded-[calc(var(--radius-bubble)-4px)] bg-black/10',
        !loaded && 'animate-pulse',
      )}
      style={{ aspectRatio: aspectRatioOf(gif) }}
    >
      <img
        src={gif.url}
        alt={gif.title ? `GIF: ${gif.title}` : 'GIF'}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className="size-full object-cover"
      />
    </div>
  );
}
