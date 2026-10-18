import { base64UrlToBytes, bytesToBase64Url } from './encoding.js';

// docs/E2EE.md §2 — identity keys: ECDH on the P-256 curve (supported by every browser that
// can install the app, including iPhones on iOS 16.4+).
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

/** Short, stable id of a public key: base64url of the first 16 bytes of SHA-256(SPKI). */
export async function keyIdOf(spkiBytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', spkiBytes));
  return bytesToBase64Url(hash.subarray(0, 16));
}

/**
 * A brand-new identity key pair. The private key is extractable only so it can be put into the
 * passphrase-locked backup once; the device keeps a non-extractable copy (importPrivateKey).
 * @returns {Promise<{ keyId: string, publicKey: string, privateKeyPkcs8: string }>}
 */
export async function generateIdentityKey() {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return {
    keyId: await keyIdOf(spki),
    publicKey: bytesToBase64Url(spki),
    privateKeyPkcs8: bytesToBase64Url(pkcs8),
  };
}

/** The device's copy: usable for decryption, but its bytes can never be read back out. */
export function importPrivateKey(pkcs8Base64Url, { extractable = false } = {}) {
  return crypto.subtle.importKey('pkcs8', base64UrlToBytes(pkcs8Base64Url), ECDH, extractable, [
    'deriveBits',
  ]);
}

/** Someone's public key, after checking that its id matches the key itself. */
export async function importPublicKey(publicKeyBase64Url, expectedKeyId) {
  const spki = base64UrlToBytes(publicKeyBase64Url);
  if (expectedKeyId && (await keyIdOf(spki)) !== expectedKeyId) {
    throw new Error('Public key does not match its id');
  }
  return crypto.subtle.importKey('spki', spki, ECDH, false, []);
}
