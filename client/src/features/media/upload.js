import { LIMITS, MEDIA_MAX_BYTES, mediaKindOf } from '@chat/shared';
import { ApiError, apiRequest, getCsrfToken } from '../../lib/http.js';

// Some phones and desktop browsers leave `file.type` empty (often for iPhone HEIC photos).
const TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export const ACCEPTED_FILES = 'image/*,video/*,.heic,.heif';

export function mimeTypeOf(file) {
  if (mediaKindOf(file.type)) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();
  return TYPE_BY_EXTENSION[extension] ?? file.type ?? '';
}

const megabytes = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Checks a picked file before uploading it, with the same rules as the server.
 * @returns {{ kind: 'image' | 'video', mimeType: string } | { error: string }}
 */
export function checkFile(file, { imagesOnly = false } = {}) {
  const mimeType = mimeTypeOf(file);
  const kind = mediaKindOf(mimeType);
  if (!kind || (imagesOnly && kind !== 'image')) {
    return {
      error: imagesOnly
        ? `“${file.name}” isn’t a photo`
        : `“${file.name}” can’t be sent: only photos and videos are supported`,
    };
  }
  if (file.size === 0) return { error: `“${file.name}” is empty` };
  if (file.size > MEDIA_MAX_BYTES[kind]) {
    return {
      error: `“${file.name}” is too large (${kind === 'image' ? 'photos' : 'videos'} up to ${megabytes(MEDIA_MAX_BYTES[kind])})`,
    };
  }
  return { kind, mimeType };
}

export const MAX_FILES = LIMITS.MAX_ATTACHMENTS;

/**
 * Width, height and duration, read in the browser. Only a fallback for storage that can't
 * measure files itself (local development); the server's own values always win.
 */
export function measure(file, kind) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done({}), 5000);
    if (kind === 'image') {
      const image = new Image();
      image.onload = () => {
        clearTimeout(timer);
        done({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        clearTimeout(timer);
        done({});
      };
      image.src = url;
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done({
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined,
      });
    };
    video.onerror = () => {
      clearTimeout(timer);
      done({});
    };
    video.src = url;
  });
}

/**
 * Sends the bytes with XMLHttpRequest, because fetch() can't report upload progress.
 * Cloudinary's URL is cross-origin and gets no cookies or CSRF token; the local development
 * upload URL is our own API, so it gets both.
 */
function sendBytes(target, file, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const sameOrigin = target.url.startsWith('/');
    xhr.open(target.method ?? 'POST', target.url);
    if (sameOrigin) {
      xhr.withCredentials = true;
      const csrf = getCsrfToken();
      if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = 'Upload failed. Please try again.';
      if (sameOrigin) {
        try {
          message = JSON.parse(xhr.responseText)?.error?.message ?? message;
        } catch {
          // not JSON
        }
      } else if (xhr.status === 400) {
        // The storage provider rejected the file itself (its messages are technical).
        message = 'This file isn’t a photo or video that can be sent';
      }
      reject(new ApiError({ status: xhr.status, code: 'UPLOAD_FAILED', message }));
    };
    xhr.onerror = () =>
      reject(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'Upload failed. Check your connection.',
        }),
      );
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    const form = new FormData();
    for (const [name, value] of Object.entries(target.fields ?? {}))
      form.append(name, String(value));
    form.append('file', file);
    xhr.send(form);
  });
}

/**
 * The three upload steps (docs/API.md §2.9): ask for a signed upload, send the file straight
 * to storage, then ask the server to verify it. Cancelling removes the upload on the server.
 * @param {{ file: File, kind: string, mimeType: string, purpose: 'message' | 'avatar',
 *   conversationId?: string, onProgress?: (fraction: number) => void, signal?: AbortSignal }} options
 * @returns {Promise<{ id: string, kind: string, mimeType: string, width: number|null,
 *   height: number|null, durationMs: number|null, size: number }>}
 */
export async function uploadFile({
  file,
  kind,
  mimeType,
  purpose,
  conversationId,
  onProgress,
  signal,
}) {
  const started = await apiRequest('/api/media/uploads', {
    method: 'POST',
    body: { purpose, ...(conversationId ? { conversationId } : {}), mimeType, size: file.size },
    signal,
  });
  try {
    await sendBytes(started.upload, file, { onProgress, signal });
    const hints = await measure(file, kind);
    const { attachment } = await apiRequest(`/api/media/uploads/${started.attachmentId}/complete`, {
      method: 'POST',
      body: hints,
      signal,
    });
    return attachment;
  } catch (err) {
    // Best effort: the server's cleanup job removes it after a day anyway.
    apiRequest(`/api/media/uploads/${started.attachmentId}`, { method: 'DELETE' }).catch(() => {});
    throw err;
  }
}

/** Removes an upload that was never sent (the × on a picked file). */
export function discardUpload(attachmentId) {
  return apiRequest(`/api/media/uploads/${attachmentId}`, { method: 'DELETE' }).catch(() => {});
}

/** URL of a sent photo/video; the server checks access and redirects to the file. */
export const mediaUrl = (attachmentId, variant = 'thumb') =>
  `/api/media/${attachmentId}?variant=${variant}`;

/**
 * Saves sent photos/videos to the device in full quality (the server checks access, then the
 * file comes as a download). Several files are started one after another.
 */
export function downloadMedia(attachmentIds) {
  attachmentIds.forEach((id, index) => {
    setTimeout(() => {
      const link = document.createElement('a');
      link.href = mediaUrl(id, 'download');
      link.download = '';
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
    }, index * 600);
  });
}
