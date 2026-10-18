import { base64UrlToBytes, bytesToBase64Url, fromUtf8, randomBytes, utf8 } from './encoding.js';

// docs/E2EE.md §3.
export const ENVELOPE_VERSION = 1;
const HKDF_INFO = utf8('adda/v1/message');

/**
 * The AES-256-GCM key two people share in one conversation: ECDH between my private key and
 * their public key, stretched with HKDF (salted with the conversation id, so every chat has a
 * different key). Both sides compute the same key; nobody else can.
 */
export async function deriveConversationKey(myPrivateKey, theirPublicKey, conversationId) {
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8(`adda/conversation/${conversationId}`),
      info: HKDF_INFO,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Binds a message to where it belongs: the server can't move it to another chat, change its
 * sender, or swap it with another message without decryption failing.
 */
export const messageAad = ({ conversationId, senderId, clientMessageId }) =>
  utf8(`adda/v1|${conversationId}|${senderId}|${clientMessageId}`);

/**
 * Encrypts a message's content (any JSON) into the envelope the server stores.
 * @returns {Promise<{ v: number, sk: string, rk: string, iv: string, ct: string }>}
 */
export async function encryptEnvelope(content, { key, aad, senderKeyId, recipientKeyId }) {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    utf8(JSON.stringify(content)),
  );
  return {
    v: ENVELOPE_VERSION,
    sk: senderKeyId,
    rk: recipientKeyId,
    iv: bytesToBase64Url(iv),
    ct: bytesToBase64Url(ciphertext),
  };
}

/** Decrypts an envelope; throws if anything was changed, or if it isn't for this key. */
export async function decryptEnvelope(envelope, { key, aad }) {
  if (envelope?.v !== ENVELOPE_VERSION) throw new Error('Unsupported message format');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(envelope.iv), additionalData: aad },
    key,
    base64UrlToBytes(envelope.ct),
  );
  return JSON.parse(fromUtf8(new Uint8Array(plaintext)));
}
