import {
  decryptGroupEnvelope,
  deriveBoxKey,
  encryptGroupEnvelope,
  importGroupKey,
  lockGroupKey,
  newGroupKeyBytes,
  unlockGroupKey,
} from '../../crypto/groupCrypto.js';
import { messageAad } from '../../crypto/messageCrypto.js';
import { apiRequest } from '../../lib/http.js';
import { getKeyring, peerPublicKeys } from './keyring.js';

/**
 * Group keys on this device (docs/GROUPS.md §3). Each group has numbered keys ("epochs"); the
 * server keeps them only locked for each member, and they are unlocked here, in memory.
 */

const groups = new Map(); // groupId → Promise<GroupState>
const boxKeys = new Map(); // `${groupId}|${myKeyId}|${userId}|${theirKeyId}` → Promise<CryptoKey>
const requested = new Map(); // groupId → time keys were last asked for

const fail = (message, code) => Object.assign(new Error(message), { code });

function requireKeyring() {
  const keyring = getKeyring();
  if (!keyring) throw fail('Encryption isn’t unlocked', 'NO_KEY');
  return keyring;
}

/** The pairwise key that locks this group's keys between me and one person. */
async function boxKeyWith(groupId, myKeyId, userId, theirKeyId) {
  const cacheKey = `${groupId}|${myKeyId}|${userId}|${theirKeyId}`;
  if (!boxKeys.has(cacheKey)) {
    const promise = (async () => {
      const mine = requireKeyring().keys.find((key) => key.keyId === myKeyId);
      if (!mine) throw fail('Key not on this device', 'NO_KEY');
      const theirs = (await peerPublicKeys(userId)).byId.get(theirKeyId);
      if (!theirs) throw fail('Unknown key', 'NO_KEY');
      return deriveBoxKey(mine.privateKey, theirs, groupId);
    })();
    promise.catch(() => boxKeys.delete(cacheKey));
    boxKeys.set(cacheKey, promise);
  }
  return boxKeys.get(cacheKey);
}

/** Asks members' open apps to share keys I'm missing (at most once a minute per group). */
function askForKeys(groupId) {
  const last = requested.get(groupId) ?? 0;
  if (Date.now() - last < 60_000) return;
  requested.set(groupId, Date.now());
  apiRequest(`/api/groups/${groupId}/keys/request`, { method: 'POST' }).catch(() => {});
}

/**
 * @typedef {{ keyEpoch: number, rotationNeeded: boolean,
 *   epochs: Map<number, { bytes: Uint8Array, key: CryptoKey }> }} GroupState
 */
async function loadGroup(groupId) {
  const keyring = requireKeyring();
  const data = await apiRequest(`/api/groups/${groupId}/keys`);
  const epochs = new Map();
  await Promise.all(
    data.boxes.map(async ({ epoch, fromUserId, box }) => {
      try {
        const boxKey = await boxKeyWith(groupId, box.rk, fromUserId, box.sk);
        const bytes = await unlockGroupKey(box, {
          boxKey,
          groupId,
          epoch,
          userId: keyring.userId,
        });
        epochs.set(epoch, { bytes, key: await importGroupKey(bytes) });
      } catch {
        // Locked for a key this device doesn't have (e.g. after a reset): ask again below.
      }
    }),
  );
  const missing = [];
  for (let epoch = 1; epoch <= data.keyEpoch; epoch += 1) {
    if (!epochs.has(epoch)) missing.push(epoch);
  }
  if (missing.length) askForKeys(groupId);
  return { keyEpoch: data.keyEpoch, rotationNeeded: data.rotationNeeded, epochs, missing };
}

function groupState(groupId) {
  if (!groups.has(groupId)) {
    const promise = loadGroup(groupId);
    promise.catch(() => groups.delete(groupId));
    groups.set(groupId, promise);
  }
  return groups.get(groupId);
}

/** The group changed (new key, members, keys shared with me): load its keys again next time. */
export function forgetGroupKeys(groupId) {
  if (groupId) groups.delete(groupId);
  else groups.clear();
}

/** Someone's identity key changed: keys locked with the old one must be derived again. */
export function forgetGroupBoxKeys() {
  boxKeys.clear();
}

async function keyForEpoch(groupId, epoch) {
  let state = await groupState(groupId);
  if (!state.epochs.has(epoch)) {
    forgetGroupKeys(groupId); // maybe shared with me just now
    state = await groupState(groupId);
  }
  const entry = state.epochs.get(epoch);
  if (!entry) throw fail('This device doesn’t have the group key yet', 'NO_GROUP_KEY');
  return entry.key;
}

/** Locks every given group key for each person (their current identity key). */
async function lockFor(groupId, userIds, entries) {
  const keyring = requireKeyring();
  const boxes = [];
  for (const userId of userIds) {
    const peer = await peerPublicKeys(userId);
    if (!peer.currentKeyId) {
      throw fail(
        'Someone in this group hasn’t set up encryption yet. They need to open Adda once.',
        'PEER_NO_KEY',
      );
    }
    const boxKey = await boxKeyWith(groupId, keyring.currentKeyId, userId, peer.currentKeyId);
    for (const { epoch, bytes } of entries) {
      boxes.push({
        userId,
        epoch,
        box: await lockGroupKey(bytes, {
          boxKey,
          groupId,
          epoch,
          userId,
          senderKeyId: keyring.currentKeyId,
          recipientKeyId: peer.currentKeyId,
        }),
      });
    }
  }
  return boxes;
}

/** Every group key this device has, oldest first (to give someone the whole history). */
async function allKeys(groupId) {
  const state = await groupState(groupId);
  return [...state.epochs.entries()]
    .sort(([a], [b]) => a - b)
    .map(([epoch, { bytes }]) => ({ epoch, bytes }));
}

/** A random id for a new group (the same format as the server's ids). */
function newGroupId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A new group: the first key, locked for me and every member, under an id chosen here. */
export async function createGroup({ name, memberIds }) {
  const keyring = requireKeyring();
  const id = newGroupId();
  const bytes = newGroupKeyBytes();
  const keyBoxes = await lockFor(id, [keyring.userId, ...memberIds], [{ epoch: 1, bytes }]);
  return apiRequest('/api/groups', {
    method: 'POST',
    body: { id, name, memberIds, keyBoxes },
  });
}

/**
 * New key after someone left (docs/GROUPS.md §3): made here, locked for every current member.
 * If another device was faster, its key is used instead.
 */
export async function rotateGroupKey(groupId, memberIds) {
  const state = await groupState(groupId);
  const epoch = state.keyEpoch + 1;
  const bytes = newGroupKeyBytes();
  const keyBoxes = await lockFor(groupId, memberIds, [{ epoch, bytes }]);
  try {
    await apiRequest(`/api/groups/${groupId}/keys/rotate`, {
      method: 'POST',
      body: { epoch, keyBoxes },
    });
  } catch (err) {
    if (err.code !== 'GROUP_KEY_OUTDATED') throw err;
  }
  forgetGroupKeys(groupId);
}

/** Gives keys to members who are missing them (asked for through `group:keys-needed`). */
export async function shareGroupKeys(groupId, userIds) {
  const entries = await allKeys(groupId);
  if (entries.length === 0) return;
  const keyBoxes = await lockFor(groupId, userIds, entries);
  await apiRequest(`/api/groups/${groupId}/keys`, { method: 'POST', body: { keyBoxes } });
}

/** Admin adds friends: every key comes along, so they can read the whole history. */
export async function addGroupMembers(groupId, userIds) {
  const keyBoxes = await lockFor(groupId, userIds, await allKeys(groupId));
  const conversation = await apiRequest(`/api/groups/${groupId}/members`, {
    method: 'POST',
    body: { userIds, keyBoxes },
  });
  forgetGroupKeys(groupId);
  return conversation;
}

/**
 * Encrypts a group message with the current key. If someone left since, a new key is made
 * first (the server refuses messages with the old one).
 */
export async function sealForGroup({ groupId, memberIds, senderId, clientMessageId, content }) {
  let state = await groupState(groupId);
  if (state.rotationNeeded) {
    await rotateGroupKey(groupId, await memberIds());
    state = await groupState(groupId);
  }
  const current = state.epochs.get(state.keyEpoch);
  if (!current) {
    askForKeys(groupId);
    throw fail('Waiting for the group key from another member…', 'NO_GROUP_KEY');
  }
  return encryptGroupEnvelope(content, {
    key: current.key,
    aad: messageAad({ conversationId: groupId, senderId, clientMessageId }),
    epoch: state.keyEpoch,
  });
}

export async function openFromGroup({ envelope, groupId, senderId, clientMessageId }) {
  const key = await keyForEpoch(groupId, envelope.e);
  return decryptGroupEnvelope(envelope, {
    key,
    aad: messageAad({ conversationId: groupId, senderId, clientMessageId }),
  });
}
