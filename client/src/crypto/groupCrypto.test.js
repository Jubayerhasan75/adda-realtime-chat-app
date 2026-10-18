import { describe, expect, it } from 'vitest';
import {
  decryptGroupEnvelope,
  deriveBoxKey,
  encryptGroupEnvelope,
  importGroupKey,
  lockGroupKey,
  newGroupKeyBytes,
  unlockGroupKey,
} from './groupCrypto.js';
import { generateIdentityKey, importPrivateKey, importPublicKey } from './keys.js';
import { messageAad } from './messageCrypto.js';

// docs/GROUPS.md §3

async function person(id) {
  const identity = await generateIdentityKey();
  return {
    id,
    keyId: identity.keyId,
    privateKey: await importPrivateKey(identity.privateKeyPkcs8),
    publicKey: await importPublicKey(identity.publicKey, identity.keyId),
  };
}

const GROUP = '64f0c0ffee0000000000abcd';

/** `from` locks the group key for `to`; returns the box. */
async function lockFor(from, to, bytes, epoch = 1) {
  return lockGroupKey(bytes, {
    boxKey: await deriveBoxKey(from.privateKey, to.publicKey, GROUP),
    groupId: GROUP,
    epoch,
    userId: to.id,
    senderKeyId: from.keyId,
    recipientKeyId: to.keyId,
  });
}

describe('group keys', () => {
  it('a member can unlock the key locked for them; nobody else can', async () => {
    const [nadia, arif, eve] = await Promise.all([person('nadia'), person('arif'), person('eve')]);
    const bytes = newGroupKeyBytes();
    const box = await lockFor(nadia, arif, bytes);
    expect(box).toMatchObject({ v: 1, sk: nadia.keyId, rk: arif.keyId });

    const opened = await unlockGroupKey(box, {
      boxKey: await deriveBoxKey(arif.privateKey, nadia.publicKey, GROUP),
      groupId: GROUP,
      epoch: 1,
      userId: 'arif',
    });
    expect([...opened]).toEqual([...bytes]);

    // Eve (not the recipient) can't open it, even knowing everything public.
    await expect(
      unlockGroupKey(box, {
        boxKey: await deriveBoxKey(eve.privateKey, nadia.publicKey, GROUP),
        groupId: GROUP,
        epoch: 1,
        userId: 'arif',
      }),
    ).rejects.toThrow();
  });

  it('a box can’t be moved to another person, epoch or group', async () => {
    const [nadia, arif] = await Promise.all([person('nadia'), person('arif')]);
    const box = await lockFor(nadia, arif, newGroupKeyBytes());
    const boxKey = await deriveBoxKey(arif.privateKey, nadia.publicKey, GROUP);
    for (const changed of [
      { groupId: GROUP, epoch: 2, userId: 'arif' },
      { groupId: GROUP, epoch: 1, userId: 'sadia' },
    ]) {
      await expect(unlockGroupKey(box, { boxKey, ...changed })).rejects.toThrow();
    }
    const otherGroupKey = await deriveBoxKey(arif.privateKey, nadia.publicKey, 'another-group');
    await expect(
      unlockGroupKey(box, { boxKey: otherGroupKey, groupId: GROUP, epoch: 1, userId: 'arif' }),
    ).rejects.toThrow();
  });
});

describe('group messages', () => {
  it('every member with the key reads it; changes and other keys are detected', async () => {
    const key = await importGroupKey(newGroupKeyBytes());
    const context = { conversationId: GROUP, senderId: 'nadia', clientMessageId: 'm-1' };
    const envelope = await encryptGroupEnvelope(
      { text: 'Exam moved to Sunday' },
      { key, aad: messageAad(context), epoch: 3 },
    );
    expect(envelope).toMatchObject({ v: 2, e: 3 });
    expect(JSON.stringify(envelope)).not.toContain('Exam');

    expect(await decryptGroupEnvelope(envelope, { key, aad: messageAad(context) })).toEqual({
      text: 'Exam moved to Sunday',
    });
    // Claiming another sender, or using another key, fails.
    await expect(
      decryptGroupEnvelope(envelope, { key, aad: messageAad({ ...context, senderId: 'arif' }) }),
    ).rejects.toThrow();
    const otherKey = await importGroupKey(newGroupKeyBytes());
    await expect(
      decryptGroupEnvelope(envelope, { key: otherKey, aad: messageAad(context) }),
    ).rejects.toThrow();
  });
});
