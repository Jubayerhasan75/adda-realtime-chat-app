import { describe, expect, it } from 'vitest';
import { decryptKeyring, encryptKeyring, passphraseProblem } from './backup.js';
import { base64UrlToBytes, bytesToBase64Url } from './encoding.js';
import { generateIdentityKey, importPrivateKey, importPublicKey, keyIdOf } from './keys.js';
import {
  decryptEnvelope,
  deriveConversationKey,
  encryptEnvelope,
  messageAad,
} from './messageCrypto.js';

const FAST_KDF = { alg: 'argon2id', memoryKiB: 1024, passes: 1, parallelism: 1 };

async function person() {
  const identity = await generateIdentityKey();
  return {
    ...identity,
    privateKey: await importPrivateKey(identity.privateKeyPkcs8),
    publicCryptoKey: await importPublicKey(identity.publicKey, identity.keyId),
  };
}

const context = { conversationId: 'c1', senderId: 'nadia', clientMessageId: 'm-1' };

describe('end-to-end message encryption', () => {
  it('both people derive the same key, so only they can read each other', async () => {
    const [nadia, arif, eve] = await Promise.all([person(), person(), person()]);
    const nadiaKey = await deriveConversationKey(nadia.privateKey, arif.publicCryptoKey, 'c1');
    const arifKey = await deriveConversationKey(arif.privateKey, nadia.publicCryptoKey, 'c1');

    const envelope = await encryptEnvelope(
      { text: 'Library at 10? 📚 লাইব্রেরি' },
      {
        key: nadiaKey,
        aad: messageAad(context),
        senderKeyId: nadia.keyId,
        recipientKeyId: arif.keyId,
      },
    );
    expect(JSON.stringify(envelope)).not.toContain('Library');
    expect(await decryptEnvelope(envelope, { key: arifKey, aad: messageAad(context) })).toEqual({
      text: 'Library at 10? 📚 লাইব্রেরি',
    });

    // Someone else (or the server with its own key) can't.
    const eveKey = await deriveConversationKey(eve.privateKey, nadia.publicCryptoKey, 'c1');
    await expect(
      decryptEnvelope(envelope, { key: eveKey, aad: messageAad(context) }),
    ).rejects.toThrow();
  });

  it('detects any change: edited bytes, another chat, another sender or message id', async () => {
    const [nadia, arif] = await Promise.all([person(), person()]);
    const key = await deriveConversationKey(nadia.privateKey, arif.publicCryptoKey, 'c1');
    const envelope = await encryptEnvelope(
      { text: 'hi' },
      { key, aad: messageAad(context), senderKeyId: nadia.keyId, recipientKeyId: arif.keyId },
    );

    const bytes = base64UrlToBytes(envelope.ct);
    bytes[0] ^= 1;
    const tampered = { ...envelope, ct: bytesToBase64Url(bytes) };
    await expect(decryptEnvelope(tampered, { key, aad: messageAad(context) })).rejects.toThrow();

    for (const changed of [
      { ...context, conversationId: 'c2' },
      { ...context, senderId: 'arif' },
      { ...context, clientMessageId: 'm-2' },
    ]) {
      await expect(decryptEnvelope(envelope, { key, aad: messageAad(changed) })).rejects.toThrow();
    }
  });

  it('uses a different key in every conversation, and a fresh IV for every message', async () => {
    const [nadia, arif] = await Promise.all([person(), person()]);
    const key1 = await deriveConversationKey(nadia.privateKey, arif.publicCryptoKey, 'c1');
    const key2 = await deriveConversationKey(nadia.privateKey, arif.publicCryptoKey, 'c2');
    const args = { aad: messageAad(context), senderKeyId: 'a', recipientKeyId: 'b' };
    const first = await encryptEnvelope({ text: 'same' }, { key: key1, ...args });
    const second = await encryptEnvelope({ text: 'same' }, { key: key1, ...args });
    expect(first.iv).not.toBe(second.iv);
    expect(first.ct).not.toBe(second.ct);
    await expect(decryptEnvelope(first, { key: key2, aad: args.aad })).rejects.toThrow();
  });

  it('device keys can never be read back out, and public keys must match their id', async () => {
    const nadia = await person();
    await expect(crypto.subtle.exportKey('pkcs8', nadia.privateKey)).rejects.toThrow();
    const other = await generateIdentityKey();
    await expect(importPublicKey(other.publicKey, nadia.keyId)).rejects.toThrow(/does not match/);
    expect(await keyIdOf(base64UrlToBytes(nadia.publicKey))).toBe(nadia.keyId);
  });
});

describe('passphrase-locked key backup', () => {
  it('restores the keyring with the right passphrase only', async () => {
    const identity = await generateIdentityKey();
    const backup = await encryptKeyring([identity], 'correct horse battery staple', FAST_KDF);
    expect(JSON.stringify(backup)).not.toContain(identity.privateKeyPkcs8);

    expect(await decryptKeyring(backup, 'correct horse battery staple')).toEqual([identity]);
    await expect(decryptKeyring(backup, 'wrong horse battery staple')).rejects.toMatchObject({
      code: 'WRONG_PASSPHRASE',
    });
  });

  it('uses strong Argon2id settings by default', async () => {
    const backup = await encryptKeyring([], 'correct horse battery staple');
    expect(backup.kdf).toMatchObject({ alg: 'argon2id', memoryKiB: 65536, passes: 3 });
    expect(base64UrlToBytes(backup.kdf.salt)).toHaveLength(16);
  });

  it('asks for a strong passphrase', () => {
    expect(passphraseProblem('password123')).toBeTruthy(); // no uppercase, no symbol
    expect(passphraseProblem('Ab1!')).toMatch(/at least 6/);
    expect(passphraseProblem('abcde1!')).toMatch(/uppercase/);
    expect(passphraseProblem('ABCDE1!')).toMatch(/lowercase/);
    expect(passphraseProblem('Abcdef!')).toMatch(/number/);
    expect(passphraseProblem('Abcde12')).toMatch(/symbol/);
    expect(passphraseProblem('Aa1!Aa1!')).toMatch(/different/);
    expect(passphraseProblem('Dh@ka7')).toBeNull();
    expect(passphraseProblem('Mango#river7')).toBeNull();
  });
});
