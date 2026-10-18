import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { ERROR_CODES, MEDIA_MAX_BYTES, mediaKindOf } from '@chat/shared';
import { Attachment } from '../models/Attachment.js';
import { ConversationMember } from '../models/ConversationMember.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { FORMAT_MIME_TYPES, formatKind } from '../utils/sniffMedia.js';
import { notFriends, requireMember } from './conversationAccess.js';
import { blockStatus, canMessage } from './relationshipService.js';
import { toPrivateUser } from './userService.js';

const HOUR_MS = 60 * 60 * 1000;
// Uploaded but never sent: removed after a day.
const UNUSED_UPLOAD_TTL_MS = 24 * HOUR_MS;
const MAX_UNUSED_UPLOADS = 30;
const CLEANUP_BATCH = 100;

const unavailable = () =>
  new AppError(503, ERROR_CODES.PROVIDER_UNAVAILABLE, 'Photo and video uploads aren’t set up yet');
// Media you may not see looks exactly like media that doesn't exist.
const mediaNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, 'Media not found');
const uploadNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, 'Upload not found');

const describeLimit = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

async function loadOwnUpload(me, attachmentId) {
  if (!mongoose.isValidObjectId(attachmentId)) throw uploadNotFound();
  const attachment = await Attachment.findOne({ _id: attachmentId, ownerId: me._id });
  if (!attachment || attachment.status === 'deleting') throw uploadNotFound();
  return attachment;
}

/** What the client sees of its own upload. */
export function toUploadView(attachment) {
  return {
    id: String(attachment._id),
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    size: attachment.size,
    status: attachment.status,
  };
}

/**
 * Photos, videos and avatars (docs/ARCHITECTURE.md §9). Bytes never pass through our server
 * in production: the browser uploads straight to storage with a signed request, then asks us
 * to verify what was stored. Viewing always goes through an authorization check.
 * @param {{ storage: import('../providers/storage/index.js').Storage | null, logger: import('pino').Logger }} deps
 */
export function createMediaService({ storage, logger }) {
  const requireStorage = () => {
    if (!storage) throw unavailable();
    return storage;
  };

  /** Removes files from storage, then their records. Failures are retried on the next run. */
  async function purgeDeleting(filter = {}) {
    if (!storage) return 0;
    const doomed = await Attachment.find({ ...filter, status: 'deleting' }).limit(CLEANUP_BATCH);
    let removed = 0;
    for (const attachment of doomed) {
      try {
        await storage.remove({ key: attachment.storage.key, kind: attachment.kind });
        await Attachment.deleteOne({ _id: attachment._id, status: 'deleting' });
        removed += 1;
      } catch (err) {
        logger.warn(
          { err, attachmentId: String(attachment._id) },
          'Media delete failed; will retry',
        );
      }
    }
    return removed;
  }

  return {
    isAvailable: () => Boolean(storage),

    /** Step 1: checks the request and returns a short-lived signed upload. */
    async createUpload(me, { purpose, conversationId, mimeType, size }) {
      const store = requireStorage();
      const kind = mediaKindOf(mimeType);
      if (!kind) {
        throw new AppError(
          415,
          ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
          'Only photos (JPEG, PNG, WebP, GIF, HEIC) and videos (MP4, MOV, WebM) can be sent',
        );
      }
      if (purpose === 'avatar' && kind !== 'image') {
        throw new AppError(
          415,
          ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
          'Profile photos must be images',
        );
      }
      if (size > MEDIA_MAX_BYTES[kind]) {
        throw new AppError(
          413,
          ERROR_CODES.TOO_LARGE,
          `${kind === 'image' ? 'Photos' : 'Videos'} can be at most ${describeLimit(MEDIA_MAX_BYTES[kind])}`,
        );
      }
      if (purpose === 'message') {
        const member = await requireMember(me, conversationId);
        if (!(await canMessage(me._id, member.peerId))) throw notFriends();
      }
      const unused = await Attachment.countDocuments({
        ownerId: me._id,
        status: { $in: ['pending', 'ready'] },
      });
      if (unused >= MAX_UNUSED_UPLOADS) {
        throw new AppError(
          429,
          ERROR_CODES.RATE_LIMITED,
          'Too many unsent uploads. Send or remove some first.',
        );
      }

      const attachment = new Attachment({
        ownerId: me._id,
        purpose,
        conversationId: purpose === 'message' ? conversationId : null,
        kind,
        mimeType,
        size,
        status: 'pending',
        expiresAt: new Date(Date.now() + UNUSED_UPLOAD_TTL_MS),
      });
      const folder = purpose === 'avatar' ? 'avatars' : 'chat';
      attachment.storage = { provider: store.name, key: `${folder}/${me._id}/${attachment._id}` };
      await attachment.save();

      const upload = await store.prepareUpload({
        key: attachment.storage.key,
        kind,
        maxBytes: MEDIA_MAX_BYTES[kind],
      });
      return {
        attachmentId: String(attachment._id),
        kind,
        upload: { url: upload.url, method: 'POST', fields: upload.fields },
        expiresAt: upload.expiresAt,
      };
    },

    /**
     * Step 3: checks what was really stored — its detected format (not the file name or the
     * type the browser claimed), size and dimensions. Anything wrong is deleted.
     */
    async completeUpload(me, attachmentId, hints) {
      const store = requireStorage();
      const attachment = await loadOwnUpload(me, attachmentId);
      if (attachment.status !== 'pending') return toUploadView(attachment);

      const stored = await store.inspect({ key: attachment.storage.key, kind: attachment.kind });
      if (!stored) {
        throw new AppError(
          409,
          ERROR_CODES.INVALID_STATE,
          'The upload hasn’t finished. Please try again.',
        );
      }
      const reject = async (message) => {
        await Attachment.updateOne({ _id: attachment._id }, { $set: { status: 'deleting' } });
        await purgeDeleting({ _id: attachment._id });
        throw new AppError(422, ERROR_CODES.INVALID_MEDIA, message);
      };
      if (formatKind(stored.format) !== attachment.kind) {
        await reject('This file isn’t a supported photo or video');
      }
      if (stored.bytes > MEDIA_MAX_BYTES[attachment.kind]) {
        await reject(`The file is larger than ${describeLimit(MEDIA_MAX_BYTES[attachment.kind])}`);
      }

      const updated = await Attachment.findOneAndUpdate(
        { _id: attachment._id, status: 'pending' },
        {
          $set: {
            status: 'ready',
            mimeType: FORMAT_MIME_TYPES[stored.format],
            size: stored.bytes,
            width: stored.width ?? hints.width ?? null,
            height: stored.height ?? hints.height ?? null,
            durationMs: stored.durationMs ?? hints.durationMs ?? null,
          },
        },
        { returnDocument: 'after' },
      );
      return toUploadView(updated ?? (await loadOwnUpload(me, attachmentId)));
    },

    /** The owner removes an upload that hasn't been sent (cancel, or removed before sending). */
    async cancelUpload(me, attachmentId) {
      const attachment = await loadOwnUpload(me, attachmentId);
      if (attachment.status === 'attached') {
        throw new AppError(409, ERROR_CODES.INVALID_STATE, 'This file was already sent');
      }
      await Attachment.updateOne(
        { _id: attachment._id, status: { $in: ['pending', 'ready'] } },
        { $set: { status: 'deleting' } },
      );
      await purgeDeleting({ _id: attachment._id });
    },

    /**
     * The ready uploads for a message being sent, in the order given. They must belong to the
     * sender and have been uploaded for this conversation.
     */
    async readyForMessage(me, conversationId, attachmentIds) {
      const found = await Attachment.find({
        _id: { $in: attachmentIds },
        ownerId: me._id,
        purpose: 'message',
        conversationId,
        status: 'ready',
      });
      if (found.length !== attachmentIds.length) {
        throw new AppError(
          409,
          ERROR_CODES.INVALID_STATE,
          'Some files aren’t uploaded yet or were already sent',
        );
      }
      const byId = new Map(found.map((a) => [String(a._id), a]));
      return attachmentIds.map((id) => byId.get(String(id)));
    },

    /** Unsent messages lose their media for good (D7). */
    async releaseMessageMedia(messageId) {
      await Attachment.updateMany({ messageId }, { $set: { status: 'deleting' } });
      await purgeDeleting({ messageId });
    },

    /**
     * Where a viewer may load a file from, or 404. Message media: current members who can
     * still see the message (not unsent, not deleted for them, not cleared). Avatars: any
     * signed-in user, unless one of the two has blocked the other.
     */
    async resolveViewUrl(me, attachmentId, variant) {
      const store = requireStorage();
      if (!mongoose.isValidObjectId(attachmentId)) throw mediaNotFound();
      const attachment = await Attachment.findById(attachmentId);
      if (!attachment || attachment.status !== 'attached') throw mediaNotFound();

      if (attachment.purpose === 'avatar') {
        const owner = await User.findOne({
          _id: attachment.ownerId,
          status: 'active',
          'avatar.attachmentId': attachment._id,
        });
        if (!owner) throw mediaNotFound();
        if (!owner._id.equals(me._id)) {
          const { iBlocked, blockedMe } = await blockStatus(me._id, owner._id);
          if (iBlocked || blockedMe) throw mediaNotFound();
        }
      } else {
        const message = await Message.findById(attachment.messageId);
        if (!message || message.unsentAt || message.hiddenFor.some((id) => id.equals(me._id))) {
          throw mediaNotFound();
        }
        const member = await ConversationMember.findOne({
          conversationId: message.conversationId,
          userId: me._id,
        });
        if (!member || message.seq <= member.clearedUpToSeq) throw mediaNotFound();
      }

      const url = store.deliveryUrl({
        key: attachment.storage.key,
        kind: attachment.kind,
        variant: attachment.purpose === 'avatar' ? 'avatar' : variant,
      });
      if (!url) throw mediaNotFound();
      return url;
    },

    /** Makes a verified image upload my profile photo; the previous one is deleted. */
    async setAvatar(me, attachmentId) {
      const attachment = await loadOwnUpload(me, attachmentId);
      if (attachment.purpose !== 'avatar' || attachment.status !== 'ready') {
        throw new AppError(
          409,
          ERROR_CODES.INVALID_STATE,
          'This upload can’t be used as a profile photo',
        );
      }
      const previous = me.avatar?.attachmentId;
      await Attachment.updateOne(
        { _id: attachment._id },
        { $set: { status: 'attached', expiresAt: null } },
      );
      const updated = await User.findByIdAndUpdate(
        me._id,
        { $set: { avatar: { attachmentId: attachment._id, version: Date.now() } } },
        { returnDocument: 'after' },
      );
      if (previous) await this.releaseAvatar(previous);
      return toPrivateUser(updated);
    },

    async removeAvatar(me) {
      const previous = me.avatar?.attachmentId;
      const updated = await User.findByIdAndUpdate(
        me._id,
        { $set: { avatar: null } },
        { returnDocument: 'after' },
      );
      if (previous) await this.releaseAvatar(previous);
      return toPrivateUser(updated);
    },

    async releaseAvatar(attachmentId) {
      await Attachment.updateOne({ _id: attachmentId }, { $set: { status: 'deleting' } });
      await purgeDeleting({ _id: attachmentId });
    },

    /**
     * Background cleanup (runs every few minutes): unsent uploads older than a day, and
     * anything marked for deletion whose storage delete failed earlier.
     */
    async cleanup(now = new Date()) {
      await Attachment.updateMany(
        { status: { $in: ['pending', 'ready'] }, expiresAt: { $lt: now } },
        { $set: { status: 'deleting' } },
      );
      return purgeDeleting();
    },

    /**
     * GIF picker settings. KLIPY's terms require searches to go straight from the browser to
     * KLIPY (no proxy), so the browser gets the app key (a public client key, not a secret)
     * and an anonymous per-user id that KLIPY asks for.
     */
    gifConfig(me, appKey) {
      if (!appKey) return { available: false };
      return {
        available: true,
        provider: 'klipy',
        appKey,
        customerId: createHash('sha256').update(`klipy:${me._id}`).digest('hex').slice(0, 32),
      };
    },
  };
}
