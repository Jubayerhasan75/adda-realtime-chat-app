import mongoose from 'mongoose';
import { ERROR_CODES, LIMITS, SERVER_EVENTS } from '@chat/shared';
import { Attachment } from '../models/Attachment.js';
import { Conversation } from '../models/Conversation.js';
import { ConversationMember } from '../models/ConversationMember.js';
import { GroupKeyBox } from '../models/GroupKeyBox.js';
import { IdentityKey } from '../models/IdentityKey.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { conversationNotFound, emitToMembers, memberIdsOf } from './conversationAccess.js';
import { serializeMessage } from './messageView.js';
import { emitToUser } from './realtime.js';
import { canMessage } from './relationshipService.js';

// docs/GROUPS.md

const adminsOnly = () => new AppError(403, ERROR_CODES.FORBIDDEN, 'Only group admins can do this');
const groupFull = () =>
  new AppError(
    409,
    ERROR_CODES.GROUP_FULL,
    `Groups can have up to ${LIMITS.GROUP_MAX_MEMBERS} people`,
  );
const badKeys = (message = 'The group keys are incomplete') =>
  new AppError(400, ERROR_CODES.VALIDATION_FAILED, message);

/** My membership of a group (not a direct chat), or "not found". */
async function requireGroupMember(me, conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) throw conversationNotFound();
  const [conversation, member] = await Promise.all([
    Conversation.findOne({ _id: conversationId, type: 'group' }),
    ConversationMember.findOne({ conversationId, userId: me._id }),
  ]);
  if (!conversation || !member) throw conversationNotFound();
  return { conversation, member };
}

async function requireAdmin(me, conversationId) {
  const found = await requireGroupMember(me, conversationId);
  if (found.member.role !== 'admin') throw adminsOnly();
  return found;
}

/** Each person's current identity key id (key boxes must be locked to it). */
async function currentKeyIds(userIds) {
  const keys = await IdentityKey.aggregate([
    { $match: { userId: { $in: userIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$userId', keyId: { $first: '$keyId' } } },
  ]);
  return new Map(keys.map((key) => [String(key._id), key.keyId]));
}

/**
 * Checks key boxes before storing them: each is for a listed person, for an existing epoch,
 * locked by my current key to their current key (so a member can't plant boxes nobody can
 * open). Returns the documents to write.
 */
async function prepareBoxes(me, conversationId, boxes, { allowedUserIds, maxEpoch }) {
  const allowed = new Set(allowedUserIds.map(String));
  const keyIds = await currentKeyIds([me._id, ...allowedUserIds]);
  const myKeyId = keyIds.get(String(me._id));
  return boxes.map(({ userId, epoch, box }) => {
    if (!allowed.has(userId)) throw badKeys('A key is for someone who isn’t in the group');
    if (epoch > maxEpoch) throw badKeys('A key is for a group key that doesn’t exist');
    if (box.sk !== myKeyId || box.rk !== keyIds.get(userId)) {
      throw badKeys('A key was locked with an old encryption key. Try again.');
    }
    return { conversationId, epoch, userId, fromUserId: me._id, box };
  });
}

/** Writes key boxes, replacing a person's box only when theirs is locked to an old key. */
async function storeBoxes(docs, session) {
  for (const doc of docs) {
    await GroupKeyBox.updateOne(
      {
        conversationId: doc.conversationId,
        userId: doc.userId,
        epoch: doc.epoch,
        'box.rk': { $ne: doc.box.rk },
      },
      { $set: doc },
      { upsert: true, session },
    ).catch((err) => {
      if (err.code !== 11000) throw err; // already has a current box: keep it
    });
  }
}

/** Adds a group notice ("Nadia added Arif") as the next message. */
async function addSystemMessage(conversationId, actorId, system, session) {
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    { $inc: { lastSeq: 1 } },
    { returnDocument: 'after', session },
  );
  const [message] = await Message.create(
    [
      {
        conversationId,
        seq: conversation.lastSeq,
        senderId: actorId,
        clientMessageId: new mongoose.Types.ObjectId().toHexString(),
        type: 'system',
        system,
      },
    ],
    { session },
  );
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { lastMessageId: message._id, lastMessageAt: message.createdAt } },
    { session },
  );
  await ConversationMember.updateMany(
    { conversationId },
    { $set: { lastMessageAt: message.createdAt } },
    { session },
  );
  return message;
}

/** After a change: the notice goes to everyone, and every member's list refreshes. */
async function announce(conversationId, message, alsoNotify = []) {
  const payload = { message: await serializeMessage(message) };
  await emitToMembers(conversationId, SERVER_EVENTS.MESSAGE_NEW, payload);
  await emitToMembers(conversationId, SERVER_EVENTS.CONVERSATION_UPDATED, {
    conversationId: String(conversationId),
  });
  for (const userId of alsoNotify) {
    emitToUser(userId, SERVER_EVENTS.CONVERSATION_REMOVED, {
      conversationId: String(conversationId),
    });
  }
}

/** Everyone the adder may put in a group: active friends who haven't blocked anyone. */
async function requireAddable(me, userIds) {
  const users = await User.find({ _id: { $in: userIds }, status: 'active' }).select('_id');
  if (users.length !== userIds.length)
    throw new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
  for (const userId of userIds) {
    if (!(await canMessage(me._id, userId))) {
      throw new AppError(403, ERROR_CODES.NOT_FRIENDS, 'You can only add your friends');
    }
  }
}

/**
 * @param {{ media: ReturnType<import('./mediaService.js').createMediaService>,
 *   conversations: ReturnType<import('./conversationService.js').createConversationService> }} deps
 */
export function createGroupService({ media, conversations }) {
  const run = (work) => mongoose.connection.transaction(work);

  return {
    /** A new group: me (admin) + at least two friends, with the first group key for everyone. */
    async create(me, { name, memberIds, keyBoxes }) {
      const ids = memberIds.filter((id) => id !== String(me._id));
      if (ids.length < 2) throw badKeys('Choose at least 2 friends');
      await requireAddable(me, ids);
      const everyone = [String(me._id), ...ids];
      const conversationId = new mongoose.Types.ObjectId();
      const docs = await prepareBoxes(me, conversationId, keyBoxes, {
        allowedUserIds: everyone,
        maxEpoch: 1,
      });
      const covered = new Set(docs.filter((d) => d.epoch === 1).map((d) => String(d.userId)));
      if (everyone.some((id) => !covered.has(id))) throw badKeys();

      let notice;
      await run(async (session) => {
        await Conversation.create(
          [
            {
              _id: conversationId,
              type: 'group',
              participantIds: everyone,
              name,
              createdBy: me._id,
              keyEpoch: 1,
            },
          ],
          { session },
        );
        await ConversationMember.create(
          everyone.map((userId) => ({
            conversationId,
            userId,
            role: userId === String(me._id) ? 'admin' : 'member',
          })),
          { session, ordered: true },
        );
        await GroupKeyBox.create(docs, { session, ordered: true });
        notice = await addSystemMessage(
          conversationId,
          me._id,
          { action: 'created', name },
          session,
        );
      });
      await announce(conversationId, notice);
      return conversations.getConversation(me, conversationId);
    },

    /** Admins add friends, who can read the whole history (their keys come along). */
    async addMembers(me, conversationId, { userIds, keyBoxes }) {
      const { conversation } = await requireAdmin(me, conversationId);
      const current = (await memberIdsOf(conversationId)).map(String);
      const newIds = userIds.filter((id) => !current.includes(id));
      if (newIds.length === 0) return conversations.getConversation(me, conversationId);
      if (current.length + newIds.length > LIMITS.GROUP_MAX_MEMBERS) throw groupFull();
      await requireAddable(me, newIds);
      const docs = await prepareBoxes(me, conversation._id, keyBoxes, {
        allowedUserIds: newIds,
        maxEpoch: conversation.keyEpoch,
      });
      // At least the current key, so they can read and write right away.
      const current_ = new Set(
        docs.filter((d) => d.epoch === conversation.keyEpoch).map((d) => String(d.userId)),
      );
      if (!conversation.rotationNeeded && newIds.some((id) => !current_.has(id))) throw badKeys();

      let notice;
      await run(async (session) => {
        await ConversationMember.create(
          newIds.map((userId) => ({ conversationId, userId, role: 'member' })),
          { session, ordered: true },
        );
        await Conversation.updateOne(
          { _id: conversationId },
          { $addToSet: { participantIds: { $each: newIds } } },
          { session },
        );
        await storeBoxes(docs, session);
        notice = await addSystemMessage(
          conversationId,
          me._id,
          { action: 'added', targetIds: newIds },
          session,
        );
      });
      await announce(conversationId, notice);
      return conversations.getConversation(me, conversationId);
    },

    /** Admins remove someone; the group then needs a new key (they can't read what follows). */
    async removeMember(me, conversationId, userId) {
      await requireAdmin(me, conversationId);
      if (String(userId) === String(me._id)) return this.leave(me, conversationId);
      const target = await ConversationMember.findOne({ conversationId, userId });
      if (!target) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Not in this group');
      let notice;
      await run(async (session) => {
        await this.dropMember(conversationId, target, session);
        notice = await addSystemMessage(
          conversationId,
          me._id,
          { action: 'removed', targetIds: [target.userId] },
          session,
        );
      });
      await announce(conversationId, notice, [target.userId]);
      return conversations.getConversation(me, conversationId);
    },

    /** Leave a group. The last admin leaving makes the longest-standing member admin. */
    async leave(me, conversationId) {
      const { member } = await requireGroupMember(me, conversationId);
      let notice = null;
      await run(async (session) => {
        await this.dropMember(conversationId, member, session);
        const remaining = await ConversationMember.find({ conversationId })
          .sort({ createdAt: 1 })
          .session(session);
        if (remaining.length === 0) {
          // Nobody left: the group, its history and its files are deleted (the cleanup job
          // removes the stored files).
          const withMedia = await Message.find({
            conversationId,
            'attachments.0': { $exists: true },
          })
            .select('_id')
            .session(session);
          await Attachment.updateMany(
            { messageId: { $in: withMedia.map((m) => m._id) } },
            { $set: { status: 'deleting' } },
            { session },
          );
          const group = await Conversation.findById(conversationId).session(session);
          if (group?.photo) {
            await Attachment.updateOne(
              { _id: group.photo.attachmentId },
              { $set: { status: 'deleting' } },
              { session },
            );
          }
          await Message.deleteMany({ conversationId }, { session });
          await GroupKeyBox.deleteMany({ conversationId }, { session });
          await Conversation.deleteOne({ _id: conversationId }, { session });
          return;
        }
        if (!remaining.some((m) => m.role === 'admin')) {
          await ConversationMember.updateOne(
            { _id: remaining[0]._id },
            { $set: { role: 'admin' } },
            { session },
          );
        }
        notice = await addSystemMessage(conversationId, me._id, { action: 'left' }, session);
      });
      emitToUser(me._id, SERVER_EVENTS.CONVERSATION_REMOVED, {
        conversationId: String(conversationId),
      });
      if (notice) await announce(conversationId, notice);
    },

    /** Removes a member's access and keys; a new group key is needed for what follows. */
    async dropMember(conversationId, member, session) {
      await ConversationMember.deleteOne({ _id: member._id }, { session });
      await GroupKeyBox.deleteMany({ conversationId, userId: member.userId }, { session });
      await Conversation.updateOne(
        { _id: conversationId },
        { $pull: { participantIds: member.userId }, $set: { rotationNeeded: true } },
        { session },
      );
    },

    /** Make someone admin, or remove admin (there must always be at least one). */
    async setRole(me, conversationId, userId, role) {
      await requireAdmin(me, conversationId);
      const target = await ConversationMember.findOne({ conversationId, userId });
      if (!target) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Not in this group');
      if (target.role === role) return conversations.getConversation(me, conversationId);
      if (role === 'member') {
        const admins = await ConversationMember.countDocuments({ conversationId, role: 'admin' });
        if (admins <= 1) {
          throw new AppError(409, ERROR_CODES.INVALID_STATE, 'A group needs at least one admin');
        }
      }
      let notice = null;
      await run(async (session) => {
        await ConversationMember.updateOne({ _id: target._id }, { $set: { role } }, { session });
        if (role === 'admin') {
          notice = await addSystemMessage(
            conversationId,
            me._id,
            { action: 'admin', targetIds: [target.userId] },
            session,
          );
        }
      });
      if (notice) await announce(conversationId, notice);
      else {
        await emitToMembers(conversationId, SERVER_EVENTS.CONVERSATION_UPDATED, {
          conversationId: String(conversationId),
        });
      }
      return conversations.getConversation(me, conversationId);
    },

    /** Rename, or change/remove the group photo (admins). */
    async update(me, conversationId, { name, photoAttachmentId }) {
      const { conversation } = await requireAdmin(me, conversationId);
      const changes = {};
      const notices = [];
      if (name !== undefined && name !== conversation.name) {
        changes.name = name;
        notices.push({ action: 'renamed', name });
      }
      let photo;
      if (photoAttachmentId !== undefined) {
        photo = photoAttachmentId ? await media.claimGroupPhoto(me, photoAttachmentId) : null;
        changes.photo = photo ? { attachmentId: photo._id, v: Date.now() } : null;
        notices.push({ action: 'photo' });
      }
      if (notices.length === 0) return conversations.getConversation(me, conversationId);
      const previous = conversation.photo?.attachmentId;
      const created = [];
      await run(async (session) => {
        await Conversation.updateOne({ _id: conversationId }, { $set: changes }, { session });
        for (const system of notices) {
          created.push(await addSystemMessage(conversationId, me._id, system, session));
        }
      });
      if (photoAttachmentId !== undefined && previous) await media.releaseAvatar(previous);
      for (const notice of created) await announce(conversationId, notice);
      return conversations.getConversation(me, conversationId);
    },

    /** My key boxes (one per epoch I was given) and the group's key state. */
    async myKeys(me, conversationId) {
      const { conversation } = await requireGroupMember(me, conversationId);
      const boxes = await GroupKeyBox.find({ conversationId, userId: me._id }).sort({ epoch: 1 });
      return {
        keyEpoch: conversation.keyEpoch,
        rotationNeeded: conversation.rotationNeeded,
        boxes: boxes.map((doc) => ({
          epoch: doc.epoch,
          fromUserId: String(doc.fromUserId),
          box: doc.box,
        })),
      };
    },

    /** I'm missing keys: ask the other members' open apps to share theirs with me. */
    async requestKeys(me, conversationId) {
      await requireGroupMember(me, conversationId);
      await emitToMembers(
        conversationId,
        SERVER_EVENTS.GROUP_KEYS_NEEDED,
        { conversationId: String(conversationId), userId: String(me._id) },
        { except: [me._id] },
      );
    },

    /** Share keys with members who are missing them (or whose identity key changed). */
    async shareKeys(me, conversationId, { keyBoxes }) {
      const { conversation } = await requireGroupMember(me, conversationId);
      const docs = await prepareBoxes(me, conversation._id, keyBoxes, {
        allowedUserIds: await memberIdsOf(conversationId),
        maxEpoch: conversation.keyEpoch,
      });
      await storeBoxes(docs);
      for (const userId of new Set(docs.map((d) => String(d.userId)))) {
        emitToUser(userId, SERVER_EVENTS.CONVERSATION_UPDATED, {
          conversationId: String(conversationId),
        });
      }
    },

    /** A new group key after someone left: must be locked for every current member. */
    async rotateKey(me, conversationId, { epoch, keyBoxes }) {
      const { conversation } = await requireGroupMember(me, conversationId);
      if (epoch !== conversation.keyEpoch + 1) {
        throw new AppError(409, ERROR_CODES.GROUP_KEY_OUTDATED, 'The group key changed');
      }
      const members = (await memberIdsOf(conversationId)).map(String);
      const docs = await prepareBoxes(me, conversation._id, keyBoxes, {
        allowedUserIds: members,
        maxEpoch: epoch,
      });
      const covered = new Set(docs.filter((d) => d.epoch === epoch).map((d) => String(d.userId)));
      if (members.some((id) => !covered.has(id))) throw badKeys();

      await run(async (session) => {
        // Only one device wins if several rotate at the same time.
        const updated = await Conversation.updateOne(
          { _id: conversationId, keyEpoch: epoch - 1 },
          { $set: { keyEpoch: epoch, rotationNeeded: false } },
          { session },
        );
        if (updated.modifiedCount !== 1) {
          throw new AppError(409, ERROR_CODES.GROUP_KEY_OUTDATED, 'The group key changed');
        }
        await GroupKeyBox.create(docs, { session, ordered: true });
      });
      await emitToMembers(conversationId, SERVER_EVENTS.CONVERSATION_UPDATED, {
        conversationId: String(conversationId),
      });
      return { keyEpoch: epoch };
    },
  };
}
