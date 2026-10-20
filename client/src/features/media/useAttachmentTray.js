import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '../../lib/toast.js';
import { rememberPreview } from './localPreviews.js';
import { partIdsOf, sendEncryptedFile } from './encryptedMedia.js';
import { MAX_FILES, checkFile, discardUpload } from './upload.js';

/**
 * @typedef {{ localId: string, file: File, kind: 'image' | 'video', mimeType: string,
 *   previewUrl: string, progress: number, status: 'uploading' | 'ready' | 'failed',
 *   attachment?: object, error?: string }} TrayItem
 */

/**
 * Files picked for the next message. Uploads start as soon as files are picked, so they are
 * usually done by the time the caption is typed. Each can be cancelled or retried.
 * @param {string} conversationId
 */
export function useAttachmentTray(conversationId) {
  /** @type {[TrayItem[], Function]} */
  const [items, setItems] = useState([]);
  const controllers = useRef(new Map());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  const patch = (localId, changes) =>
    setItems((list) =>
      list.map((item) => (item.localId === localId ? { ...item, ...changes } : item)),
    );

  const start = useCallback(
    (item) => {
      const controller = new AbortController();
      controllers.current.set(item.localId, controller);
      sendEncryptedFile({
        file: item.file,
        kind: item.kind,
        mimeType: item.mimeType,
        conversationId,
        signal: controller.signal,
        onProgress: (progress) => patch(item.localId, { progress }),
      })
        .then((attachment) => patch(item.localId, { status: 'ready', progress: 1, attachment }))
        .catch((err) => {
          if (err.name === 'AbortError') return;
          patch(item.localId, { status: 'failed', error: err.message });
        })
        .finally(() => controllers.current.delete(item.localId));
    },
    [conversationId],
  );

  const add = useCallback(
    (files) => {
      const room = MAX_FILES - itemsRef.current.length;
      const picked = [...files];
      if (picked.length > room) {
        showToast(`You can send up to ${MAX_FILES} photos or videos at once`);
      }
      const accepted = [];
      for (const file of picked.slice(0, Math.max(room, 0))) {
        const checked = checkFile(file);
        if (checked.error) {
          showToast(checked.error);
          continue;
        }
        accepted.push({
          localId: crypto.randomUUID(),
          file,
          kind: checked.kind,
          mimeType: checked.mimeType,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'uploading',
        });
      }
      if (accepted.length === 0) return;
      setItems((list) => [...list, ...accepted]);
      accepted.forEach(start);
    },
    [start],
  );

  const remove = useCallback((localId) => {
    const item = itemsRef.current.find((i) => i.localId === localId);
    if (!item) return;
    controllers.current.get(localId)?.abort();
    if (item.attachment) partIdsOf([item.attachment]).forEach(discardUpload);
    URL.revokeObjectURL(item.previewUrl);
    setItems((list) => list.filter((i) => i.localId !== localId));
  }, []);

  const retry = useCallback(
    (localId) => {
      const item = itemsRef.current.find((i) => i.localId === localId);
      if (!item || item.status !== 'failed') return;
      const fresh = { ...item, status: 'uploading', progress: 0, error: undefined };
      patch(localId, fresh);
      start(fresh);
    },
    [start],
  );

  /** The uploaded files for the message being sent; the tray is emptied. */
  const take = useCallback(() => {
    const ready = itemsRef.current.filter((item) => item.status === 'ready');
    ready.forEach((item) => rememberPreview(item.attachment.id, item.previewUrl));
    setItems([]);
    return ready.map((item) => item.attachment);
  }, []);

  // Leaving the chat: stop uploads and remove files that were never sent.
  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      for (const item of itemsRef.current) {
        if (item.attachment) partIdsOf([item.attachment]).forEach(discardUpload);
        URL.revokeObjectURL(item.previewUrl);
      }
    },
    [],
  );

  return {
    items,
    add,
    remove,
    retry,
    take,
    busy: items.some((item) => item.status !== 'ready'),
    readyCount: items.filter((item) => item.status === 'ready').length,
  };
}
