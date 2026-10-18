import { Readable } from 'node:stream';
import { ERROR_CODES, MEDIA_MAX_BYTES } from '@chat/shared';
import { AppError } from '../utils/AppError.js';

const media = (req) => req.app.locals.services.media;
const me = (req) => req.auth.user;

export async function createUpload(req, res) {
  res.status(201).json({ data: await media(req).createUpload(me(req), req.body) });
}

export async function completeUpload(req, res) {
  res.json({
    data: {
      attachment: await media(req).completeUpload(me(req), req.params.attachmentId, req.body),
    },
  });
}

export async function cancelUpload(req, res) {
  await media(req).cancelUpload(me(req), req.params.attachmentId);
  res.status(204).end();
}

/**
 * Authorization check, then a redirect to a signed storage URL. The redirect itself is never
 * cached, so access is re-checked on every load (docs/API.md §2.9).
 */
export async function view(req, res) {
  const url = await media(req).resolveViewUrl(
    me(req),
    req.params.attachmentId,
    req.validatedQuery.variant,
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.redirect(302, url);
}

export async function setAvatar(req, res) {
  res.json({ data: { user: await media(req).setAvatar(me(req), req.body.attachmentId) } });
}

export async function removeAvatar(req, res) {
  res.json({ data: { user: await media(req).removeAvatar(me(req)) } });
}

export function gifConfig(req, res) {
  res.json({ data: media(req).gifConfig(me(req), req.app.locals.env.KLIPY_APP_KEY) });
}

// ── Local development storage only (MEDIA_STORAGE=local) ──────────────────────────────────

const MULTIPART_LIMIT = MEDIA_MAX_BYTES.video + 64 * 1024;

/** Receives a browser upload the way Cloudinary would: multipart form with `token` + `file`. */
export async function localUpload(req, res) {
  const length = Number(req.headers['content-length'] ?? 0);
  if (length > MULTIPART_LIMIT) throw new AppError(413, ERROR_CODES.TOO_LARGE, 'File is too large');
  const form = await new Request('http://local/upload', {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? '' },
    body: Readable.toWeb(req),
    duplex: 'half',
  })
    .formData()
    .catch(() => {
      throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Expected a multipart upload');
    });
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'No file in the upload');
  }
  const result = await req.app.locals.storage.acceptUpload(form.get('token'), file);
  if (result === 'too_large') throw new AppError(413, ERROR_CODES.TOO_LARGE, 'File is too large');
  if (result !== 'stored') throw new AppError(403, ERROR_CODES.FORBIDDEN, 'Upload link expired');
  res.status(201).json({ data: { ok: true } });
}

export async function localFile(req, res) {
  const file = await req.app.locals.storage.readSigned(
    req.params.name,
    req.query.exp,
    req.query.sig,
  );
  if (!file) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Media not found');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Type', file.mimeType);
  if (req.query.download === '1') {
    const extension = file.mimeType.split('/')[1]?.replace('quicktime', 'mov') ?? 'bin';
    const kind = file.mimeType.startsWith('video/') ? 'video' : 'photo';
    res.setHeader('Content-Disposition', `attachment; filename="adda-${kind}.${extension}"`);
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.data);
}
