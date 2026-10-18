# Group chats

Messenger-style groups of up to **50 people**, end-to-end encrypted like one-to-one chats.
Decisions by the owner (2026-10-18): admins manage the group; **new members can read the whole
history** (messages, photos, videos).

## 1. What members can do

| Action                                     | Who                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Create a group (name + at least 2 friends) | Anyone                                                                       |
| Send, react, reply, edit/unsend own, pin   | Every member                                                                 |
| Add people (only your friends)             | Admins                                                                       |
| Remove people, make/remove admin           | Admins                                                                       |
| Rename, change or remove the group photo   | Admins                                                                       |
| Leave                                      | Anyone. If the last admin leaves, the longest-standing member becomes admin. |
| Mute, colour, clear chat, delete chat      | Each member, for themselves only                                             |

The creator is the first admin. Changes appear in the chat as small system lines
("Nadia added Arif", "Arif left the group").

## 2. Data

- `Conversation`: `type: 'group'`, `name`, `photo` (avatar attachment), `createdBy`,
  `keyEpoch` (current group key number) and `rotationNeeded`. `directKey` only exists for
  direct chats.
- `ConversationMember`: one row per member (`role: 'admin' | 'member'`). Its existence is the
  only proof of access, exactly like direct chats. Leaving or being removed deletes the row, so
  the group disappears from that person's list and every API answers "not found".
- `GroupKeyBox`: the group key of one epoch, locked for one member (§3).
- `Message`: `type: 'system'` for membership changes (`system: { action, actorId, targetIds,
name }`). These are plain on purpose: the server already knows who is in the group.

## 3. Encryption

- **Group key:** 32 random bytes made on a member's device (AES-256-GCM). Each key has an
  `epoch` number; the server never sees any key.
- **Key boxes:** to give the key to a member, a device encrypts it with the pairwise key it
  shares with that member (ECDH P-256 + HKDF-SHA-256, salt `adda/group/<groupId>`, info
  `adda/v1/group-key`) — the same primitives as one-to-one chats. The box records which identity
  keys were used (`sk`, `rk`), so it keeps working after either person changes keys later on
  other devices.
- **Messages:** envelope `{ v: 2, e: epoch, iv, ct }`, AES-256-GCM with the epoch's group key and
  the same associated data as direct messages (`adda/v1|groupId|senderId|clientMessageId`).
- **Full history for new members:** the admin's device that adds someone also locks **every
  epoch's key** for them. Any member's device can do the same later if the new person is missing
  a key (they ask; the server relays the request to members who are online).
- **Leaving / removal:** the server sets `rotationNeeded`. The next member's device that sends a
  message first makes a new key (epoch + 1) for the remaining members; the server refuses group
  messages until that happened. People who left can't read anything sent after they left.
- **A member changes their identity key** (new device setup, reset): their boxes are relocked for
  the new key on request by any online member.

**Limits (documented honestly):** a member who leaves keeps whatever they could already read;
group messages are not signed, so a malicious server _together with_ a malicious member could
fake who sent a message; metadata (members, timing) is visible to the server, as for direct
chats.

## 4. Delivery and receipts

- Messages, edits, reactions, typing and receipts go to every member.
- Ticks: **delivered** when every other member's device got it, **seen** when everyone read it
  (each member's read receipts setting still applies to them).
- Push: `Group name` · `Nadia: New message` (the text stays encrypted).
