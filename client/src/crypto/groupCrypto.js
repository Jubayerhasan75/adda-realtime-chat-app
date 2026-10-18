import { base64UrlToBytes, bytesToBase64Url, fromUtf8, randomBytes, utf8 } from './encoding.js';
import { decryptEnvelope, encryptEnvelope } from './messageCrypto.js';

// docs/GROUPS.md §3.
export const GROUP_ENVELOPE_VERSION = 2;
const BOX_INFO = utf8('adda/v1/group-key');

/** A brand-new group key: 32 random bytes (kept raw in memory so it can be given to members). */
export const newGroupKeyBytes = () => randomBytes(32);

/** The message key made from a group key's bytes (usable, but never readable back out). */
export function importGroupKey(bytes) {
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * The key that locks group keys between two people for one group: ECDH between my private key
 * and their public key, stretched with HKDF salted with the group id. Only the two of us can
 * compute it.
 */
export async function deriveBoxKey(myPrivateKey, theirPublicKey, groupId) {
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8(`adda/group/${groupId}`), info: BOX_INFO },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Binds a locked key to its group, epoch and recipient (it can't be reused anywhere else). */
const boxAad = ({ groupId, epoch, userId }) =>
  utf8(`adda/v1/group-key|${groupId}|${epoch}|${userId}`);

/** Locks a group key for one member. */
export function lockGroupKey(
  bytes,
  { boxKey, groupId, epoch, userId, senderKeyId, recipientKeyId },
) {
  return encryptEnvelope(
    { k: bytesToBase64Url(bytes) },
    {
      key: boxKey,
      aad: boxAad({ groupId, epoch, userId }),
      senderKeyId,
      recipientKeyId,
    },
  );
}

/** Opens a group key that was locked for me; throws if it was changed or isn't mine. */
export async function unlockGroupKey(box, { boxKey, groupId, epoch, userId }) {
  const { k } = await decryptEnvelope(box, {
    key: boxKey,
    aad: boxAad({ groupId, epoch, userId }),
  });
  const bytes = base64UrlToBytes(k);
  if (bytes.length !== 32) throw new Error('Invalid group key');
  return bytes;
}

/** Encrypts a group message with the group key of `epoch`. */
export async function encryptGroupEnvelope(content, { key, aad, epoch }) {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    utf8(JSON.stringify(content)),
  );
  return {
    v: GROUP_ENVELOPE_VERSION,
    e: epoch,
    iv: bytesToBase64Url(iv),
    ct: bytesToBase64Url(ciphertext),
  };
}

export async function decryptGroupEnvelope(envelope, { key, aad }) {
  if (envelope?.v !== GROUP_ENVELOPE_VERSION) throw new Error('Unsupported message format');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(envelope.iv), additionalData: aad },
    key,
    base64UrlToBytes(envelope.ct),
  );
  return JSON.parse(fromUtf8(new Uint8Array(plaintext)));
}
