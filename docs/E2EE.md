# End-to-end encryption (E2EE)

Decided 2026-10-17 (REQUIREMENTS.md D15): **everything** a person writes or sends in a chat — text, edits, replies, GIF choices, photos and videos — is encrypted on the sender's device and can only be decrypted on the two participants' devices. The server, the database, Cloudinary and the developer only ever see encrypted data.

Everything uses the browser's built-in **Web Crypto API** (free, audited, no keys leave it in plain form), plus **Argon2id** (hash-wasm, MIT) to protect the key backup with your recovery password.

## 1. What is protected, and what is not

| Protected (only sender and recipient can read)                 | Still visible to the server (needed to deliver messages)             |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Message text, captions, edits                                  | Who is friends and who chats with whom                               |
| Reply quotes (the quoted text)                                 | When messages are sent, their order, approximate size                |
| Which GIF was sent                                             | Delivered/seen ticks, reactions (emoji), pins, online status         |
| Photos, videos, their thumbnails, sizes, length                | Number of attachments, encrypted file sizes                          |
| Your private keys (backup is locked by your recovery password) | Profile name, username, bio, profile photo (they are public profile) |

**Honest limits**

1. **Metadata** (right column) is visible, as in every messenger.
2. **Web apps get their code from the server.** A dishonest operator could ship code that leaks keys. Mitigations: the code is public (GitHub), and people can compare **safety numbers** (§5) to detect swapped keys. Native apps from an app store would reduce this further (Capacitor, later).
3. **No forward secrecy in v1.** Each pair of people shares one key per key pair. If a device and its unlocked keys are stolen, that person's past messages can be decrypted. Keys can be rotated (new key pair), which protects future messages. A double ratchet (Signal protocol) is the upgrade path.
4. **Forgotten recovery password** = old messages cannot be recovered on new devices. Nobody can help, by design.
5. Search, notification previews and media checks move to the devices (§6–8).

## 2. Keys

- **Identity key pair** per person: ECDH **P-256** (supported by every browser that can install the app, including iOS 16.4+).
- Public key: stored by the server in `IdentityKey {userId, keyId, publicKey (SPKI, base64url), createdAt}`. `keyId` = first 16 bytes of SHA-256(SPKI), base64url. Old public keys are kept, so old messages stay readable.
- Private key on the device: stored in IndexedDB as a **non-extractable** `CryptoKey`. Page scripts can use it but can never read it out. Removed on deliberate logout.
- **Keyring backup:** all of a person's private keys are encrypted with a key derived from the **recovery password**:
  - **Argon2id** (64 MiB memory, 3 passes, random 16-byte salt), then **AES-256-GCM**.
  - The server stores only `{kdf params, salt, iv, ciphertext}` and can't open it.
  - The recovery password must have at least 6 characters including an uppercase letter, a lowercase letter, a number and a symbol (owner's decision, 2026-10-18; checked live while typing). Every guess costs a full Argon2id run, which keeps guessing slow. It is never sent anywhere.
- New device or password reset: type the recovery password → the keyring is decrypted locally → imported as non-extractable keys.
- Forgotten recovery password: "Reset encryption" makes a new key pair. Friends see "security code changed". Old messages stay unreadable.

## 3. Message encryption

- **Conversation key** = HKDF-SHA-256(ECDH(my private key, their public key), salt = conversationId, info = "adda/v1/message"). This is one AES-256-GCM key per pair of key pairs, cached in memory.
- **Each message**: fresh random 96-bit IV. Additional authenticated data = `conversationId|senderId|clientMessageId`, so the server can't move a message to another chat or pretend someone else sent it.
- **Envelope** stored by the server (opaque to it): `{v: 1, sk: senderKeyId, rk: recipientKeyId, iv, ct}`. The plaintext is JSON: `{text?, gif?, attachments?: [{id, name, mime, size, width, height, durationMs, key, parts, thumb?}]}`.
- Edits replace the envelope (new IV). Unsend deletes it.

## 4. Photos and videos (implemented 2026-10-21)

- Photos larger than 2048 px or 1.5 MB are resized to JPEG on the sender's phone first (GIFs keep their animation). HEIC photos that the browser can't decode are sent as they are, without a preview.
- Both phones check the real file type from its first bytes (the sender before encrypting, the receiver after decrypting).
- Profile photos are not end-to-end encrypted: they are part of the public profile.

- Each file gets its own random AES-256-GCM key. It is encrypted in 1 MiB chunks (each chunk has its own IV = base IV + counter, and the tag protects order and length).
- The encrypted file is uploaded as Cloudinary **raw** pieces of up to 9.5 MB each (the free plan's limit is 10 MB per raw file), so videos can be up to 100 MB.
- The sender's device makes a small **thumbnail** (photo or first video frame), which is encrypted the same way.
- The per-file keys travel **inside the encrypted message**, never to the server.
- Viewing: download the pieces through the access-checked `/api/media/:id` redirect, decrypt on the device, then show it from a local blob. **Download** saves the decrypted file.
- The server can't inspect encrypted files, so the receiving device checks the real format after decrypting. A file that isn't really a photo/video is shown as "can't open" and is not displayed.

## 5. Safety numbers

- Each chat has a 60-digit **safety number**, computed from both people's current public keys (like Signal). If it matches on both phones, nobody swapped keys in the middle.
- When a friend's key changes, the chat shows "Nadia's security code changed".

## 6. Notifications

- The server can't read messages, so a push only carries the encrypted envelope (when it fits in 4 KB).
- With the "name and message" setting, the **service worker decrypts it on the phone** to show the text. Otherwise it shows "New message".

## 7. Search

- Server-side message search is removed (it can't read the messages).
- Search runs on the device over the messages it has decrypted and loaded. In a chat, it can load older messages to search further.

## 8. Migration

All earlier test messages and media were deleted (they weren't encrypted). Accounts and friendships stay.
