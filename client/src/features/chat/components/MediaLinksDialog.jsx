import { ImageOff, Images, Link2, MessageSquareText, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Dialog } from '../../../components/ui/Dialog.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { cn } from '../../../lib/cn.js';
import { formatDuration, formatListTimestamp } from '../../../lib/format.js';
import { findLinks, linkHost } from '../../../lib/links.js';
import { MediaViewer } from '../../media/components/MediaViewer.jsx';
import { isEncrypted } from '../../media/encryptedMedia.js';
import { useEncryptedThumb } from '../../media/useEncryptedThumb.js';
import { mediaUrl } from '../../media/upload.js';
import { flattenHistory, useChatMedia, useHistoryScan } from '../api.js';
import { nameOf } from '../lib/chatInfo.js';

const TABS = [
  { id: 'media', label: 'Media', Icon: Images },
  { id: 'links', label: 'Links', Icon: Link2 },
];
// Links are found on this device (the server can't read messages): look through this many
// pages of history automatically, then on request.
const AUTO_LINK_PAGES = 10;

function EncryptedThumb({ attachment, onFailed }) {
  const { url, failed } = useEncryptedThumb(attachment);
  useEffect(() => {
    if (failed) onFailed();
  }, [failed, onFailed]);
  return url ? <img src={url} alt="" className="size-full object-cover" /> : null;
}

function Tile({ attachment, onOpen }) {
  const [failed, setFailed] = useState(false);
  const video = attachment.kind === 'video';
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={video ? 'Open video' : 'Open photo'}
      className="relative block aspect-square w-full overflow-hidden rounded-md bg-surface-muted"
    >
      {failed ? (
        <span className="flex size-full items-center justify-center text-muted">
          <ImageOff aria-hidden="true" className="size-5" />
        </span>
      ) : isEncrypted(attachment) ? (
        <EncryptedThumb attachment={attachment} onFailed={() => setFailed(true)} />
      ) : (
        <img
          src={mediaUrl(attachment.id, video ? 'poster' : 'thumb')}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
      {video && (
        <span className="absolute right-1 bottom-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
          <Play aria-hidden="true" className="size-3 fill-current" />
          {formatDuration(attachment.durationMs)}
        </span>
      )}
    </button>
  );
}

function MediaTab({ conversationId, onView }) {
  const media = useChatMedia(conversationId);
  const items = useMemo(
    () => (media.data?.pages ?? []).flatMap((page) => page.messages.flatMap((m) => m.attachments)),
    [media.data],
  );

  if (media.isPending) {
    return (
      <div className="grid grid-cols-3 gap-1" aria-label="Loading">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-md" />
        ))}
      </div>
    );
  }
  if (media.isError) return <Alert tone="error">{media.error.message}</Alert>;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Images aria-hidden="true" className="size-6" />}
        title="No photos or videos yet"
        description="Photos and videos sent in this chat show up here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Photos and videos" className="grid grid-cols-3 gap-1">
        {items.map((attachment, index) => (
          <li key={attachment.id}>
            <Tile attachment={attachment} onOpen={() => onView(items, index)} />
          </li>
        ))}
      </ul>
      {media.hasNextPage && (
        <Button
          variant="secondary"
          loading={media.isFetchingNextPage}
          onClick={() => media.fetchNextPage()}
        >
          Show older
        </Button>
      )}
    </div>
  );
}

function LinksTab({ conversation, currentUserId, onShowInChat }) {
  const history = useHistoryScan(conversation.id);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const pagesLoaded = history.data?.pages.length ?? 0;

  // Look further back automatically for a while (links are found in the decrypted text).
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && pagesLoaded < AUTO_LINK_PAGES) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, pagesLoaded, fetchNextPage]);

  const links = useMemo(
    () =>
      flattenHistory(history.data)
        .filter((message) => message.text && !message.unsentAt)
        .flatMap((message) => findLinks(message.text).map((link) => ({ ...link, message })))
        .reverse(),
    [history.data],
  );
  const searching = history.isPending || (hasNextPage && pagesLoaded < AUTO_LINK_PAGES);

  if (history.isError) return <Alert tone="error">{history.error.message}</Alert>;
  return (
    <div className="flex flex-col gap-3">
      {links.length > 0 && (
        <ul aria-label="Links" className="flex flex-col">
          {links.map(({ href, message }, index) => (
            <li key={`${message.id}-${index}`} className="flex items-center gap-1">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-hover active:bg-surface-active"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-link">
                  <Link2 aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-text">
                    {linkHost(href)}
                  </span>
                  <span className="block truncate text-sm text-link">{href}</span>
                  <span className="block truncate text-xs text-muted">
                    {nameOf(conversation, message.senderId, currentUserId)} ·{' '}
                    {formatListTimestamp(new Date(message.createdAt))}
                  </span>
                </span>
              </a>
              <button
                type="button"
                aria-label="Show in chat"
                title="Show in chat"
                onClick={() => onShowInChat(message.id)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-text"
              >
                <MessageSquareText aria-hidden="true" className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && (
        <div className="flex flex-col gap-2" role="status" aria-label="Looking for links">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      )}
      {!searching && links.length === 0 && (
        <EmptyState
          icon={<Link2 aria-hidden="true" className="size-6" />}
          title="No links yet"
          description="Links shared in this chat show up here."
        />
      )}
      {!searching && hasNextPage && (
        <Button variant="secondary" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
          Look further back
        </Button>
      )}
    </div>
  );
}

/**
 * "Media and links" from the chat's info, like Messenger: every photo and video in a grid,
 * and every link that was shared. Tapping a photo opens it full screen; a link opens in a new
 * tab, and "Show in chat" jumps to the message it was in.
 */
export function MediaLinksDialog({ open, conversation, currentUserId, onClose, onJumpTo }) {
  const [tab, setTab] = useState('media');
  const [viewing, setViewing] = useState(null);

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Media and links">
        <div
          role="tablist"
          aria-label="Media and links"
          className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1"
        >
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors duration-(--duration-fast)',
                tab === id ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-label={tab === 'media' ? 'Media' : 'Links'}>
          {open && tab === 'media' && (
            <MediaTab
              conversationId={conversation.id}
              onView={(items, startIndex) => setViewing({ items, startIndex })}
            />
          )}
          {open && tab === 'links' && (
            <LinksTab
              conversation={conversation}
              currentUserId={currentUserId}
              onShowInChat={(messageId) => {
                onClose();
                onJumpTo(messageId);
              }}
            />
          )}
        </div>
      </Dialog>
      <MediaViewer
        items={viewing?.items ?? null}
        startIndex={viewing?.startIndex ?? 0}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
