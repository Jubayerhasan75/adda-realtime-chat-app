# API and Real-Time Event Contract (Phase 1)

Status: **Draft for approval** (2026-10-15). This is the contract the implementation must follow. Changes to the contract happen here first.
Request schemas live in `shared/src/schemas/*` (Zod) and are used by both client and server.

## 1. Conventions

**Base URL:** `/api` (same origin as the app). JSON only (`Content-Type: application/json`), body limit 32 KB. Media never goes through the JSON API.

**Authentication:** the HttpOnly cookie `__Host-sid` (`Secure; HttpOnly; SameSite=Lax; Path=/`). In local development over plain http, the cookie is named `sid` without `Secure`, because the `__Host-` prefix requires HTTPS.

**CSRF:**

- Every non-GET request must send the header `X-CSRF-Token`. The token comes from `GET /api/auth/session` and is an HMAC of the session's `csrfSecret`.
- The server also rejects any request whose `Origin` header (or, if absent, `Referer`) isn't in the allowlist.
- Without a session (register, login, forgot password), the strict `Origin` check alone protects the request. All state-changing requests without a matching `Origin`/`Referer` are rejected with 403 `ORIGIN_REJECTED`.

**Success shape:**

```json
{ "data": { ... } }
{ "data": [ ... ], "page": { "nextCursor": "opaque-string-or-null" } }
```

**Error shape** (never includes stack traces or internal messages):

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human-readable",
    "details": [{ "path": "username", "issue": "too_short" }],
    "requestId": "01J..."
  }
}
```

| Status    | Typical codes                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 400       | `VALIDATION_FAILED`, `INVALID_CURSOR`                                                                                                     |
| 401       | `UNAUTHENTICATED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`                                                                               |
| 403       | `CSRF_FAILED`, `ORIGIN_REJECTED`, `EMAIL_NOT_VERIFIED`, `NOT_FRIENDS`, `FORBIDDEN`                                                        |
| 404       | `NOT_FOUND` — also used instead of 403 whenever revealing that something exists would leak information (e.g. another user's conversation) |
| 409       | `USERNAME_TAKEN`, `REQUEST_EXISTS`, `REQUEST_EXISTS_INCOMING`, `ALREADY_FRIENDS`, `EDIT_WINDOW_CLOSED`                                    |
| 413 / 415 | `TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`                                                                                                     |
| 422       | `INVALID_MEDIA`, `INVALID_STATE`                                                                                                          |
| 429       | `RATE_LIMITED` (+ `Retry-After` header)                                                                                                   |
| 500       | `INTERNAL_ERROR` (details only in server logs, matched by `requestId`)                                                                    |
| 503       | `PROVIDER_UNAVAILABLE` (email/media/GIF not configured or down), `SERVICE_UNAVAILABLE` (database unreachable)                             |

The canonical list lives in `shared/src/errors.js`. Every response carries an `X-Request-Id` header.

**Pagination:** opaque base64url cursors. Default `limit` is 30, max 50. Results are always bounded.

**IDs:** 24-hex ObjectIds, validated before any DB call.

## 2. REST endpoints

Auth column:

- **–** = public
- **S** = logged in
- **V** = logged in and email verified
- **P** = logged in and the request body contains the current password (sensitive actions re-check it inline instead of using a separate re-auth step)

### 2.1 Health

| Method | Path              | Auth | Description                            |
| ------ | ----------------- | ---- | -------------------------------------- |
| GET    | /api/health       | –    | Liveness `{status:"ok"}`               |
| GET    | /api/health/ready | –    | DB ping. 503 if the DB is unavailable. |

### 2.2 Auth — `/api/auth`

| Method | Path                  | Auth | Body → Result                                                                                                                                                                                                                                                                                                                                        |
| ------ | --------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method | Path                  | Auth | Body → Result                                                                                                                                                                                                                                                                                                                                        |
| ---    | ---                   | ---  | ---                                                                                                                                                                                                                                                                                                                                                  |
| POST   | /register             | –    | `{email, username, displayName, password}` → **202** `{message}`. No session is created; a verification email is sent. If the email is already registered, the response is identical, nothing is created, and that address gets a "someone tried to sign up" email (no enumeration). A taken username → 409 `USERNAME_TAKEN` (usernames are public). |
| POST   | /login                | –    | `{identifier, password}` (email or username) → 200 `{user, csrfToken}` + session cookie. Unknown user and wrong password return the same 401 `INVALID_CREDENTIALS`. Unverified users can log in (the app shows the verify notice).                                                                                                                   |
| POST   | /logout               | –    | Revokes the current session (if any) and clears the cookie → 204                                                                                                                                                                                                                                                                                     |
| GET    | /session              | –    | `{user                                                                                                                                                                                                                                                                                                                                               | null, csrfToken | null}`. Used on app start. |
| POST   | /verify-email         | –    | `{token}` → 200. Reused/expired token → 400 `INVALID_TOKEN`.                                                                                                                                                                                                                                                                                         |
| POST   | /resend-verification  | S    | → 202 (3/h per address)                                                                                                                                                                                                                                                                                                                              |
| POST   | /forgot-password      | –    | `{email}` → always 202                                                                                                                                                                                                                                                                                                                               |
| POST   | /reset-password       | –    | `{token, newPassword}` → 200. Revokes **all** sessions; also marks the email verified.                                                                                                                                                                                                                                                               |
| POST   | /change-password      | P    | `{currentPassword, newPassword}` → 200 `{user, csrfToken}`. Revokes every session and issues a new one for this device (new cookie + CSRF token). Wrong current password → 400 with field error.                                                                                                                                                     |
| POST   | /change-email         | P    | `{newEmail, password}` → 202. Sends a confirmation link to the new address and a notice to the old one. If the address belongs to another account nothing is sent (same response).                                                                                                                                                                   |
| POST   | /confirm-email-change | –    | `{token}` → 200                                                                                                                                                                                                                                                                                                                                      |
| GET    | /sessions             | S    | `[{id, device, ipPrefix, createdAt, lastUsedAt, current}]`                                                                                                                                                                                                                                                                                           |
| DELETE | /sessions/:id         | S    | Revoke one of **your own** sessions → 204 (someone else's or malformed id → 404)                                                                                                                                                                                                                                                                     |
| DELETE | /sessions             | S    | Revoke all except the current one → 204                                                                                                                                                                                                                                                                                                              |

Password policy: 10–128 characters and not in a list of the most common passwords. No composition rules (NIST 800-63B).

### 2.3 Users — `/api/users`

| Method | Path         | Auth | Description                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /me          | S    | Full own profile + settings                                                                                                                                                                                                                                                                                                                           |
| PATCH  | /me          | S    | `{displayName?, bio?}` (control/bidi characters stripped)                                                                                                                                                                                                                                                                                             |
| PATCH  | /me/username | S    | `{username}`. 409 if taken; 429 if changed in the last 7 days.                                                                                                                                                                                                                                                                                        |
| PUT    | /me/avatar   | V    | `{attachmentId}` (purpose=avatar, status=ready, owned by me). **Phase 8.**                                                                                                                                                                                                                                                                            |
| DELETE | /me/avatar   | V    | Remove the avatar                                                                                                                                                                                                                                                                                                                                     |
| DELETE | /me          | P    | `{password, confirm:"DELETE"}` → 204 + cookie cleared. Account deletion (DATABASE.md §4)                                                                                                                                                                                                                                                              |
| GET    | /search?q=   | V    | `q`: 1–20 chars from the username alphabet (case-insensitive). Exact match first, then prefix matches. Excludes me, unverified accounts, users who blocked me, users I blocked, and non-discoverable users (except on an exact match). → `[{user, relationship}]`, `relationship` = `none\|friends\|outgoing\|incoming`. Limit 20. Rate limit 60/min. |
| GET    | /:username   | V    | `{user, relationship}` with `relationship` also `self` or `blocked` (I blocked them, so I can unblock). 404 if they blocked me — identical to a missing account.                                                                                                                                                                                      |
| POST   | /:id/report  | V    | `{reason: spam\|harassment\|impersonation\|inappropriate\|other, details?}` → 201. Repeat reports are accepted but stored once. Not yourself (400). Rate limit 10/day. (Message reports arrive with messaging.)                                                                                                                                       |

### 2.4 Settings — `/api/settings`

| Method | Path | Auth | Description                                                                                                                     |
| ------ | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /    | S    | `user.settings`                                                                                                                 |
| PATCH  | /    | S    | Partial deep update, validated against the enums. Privacy changes are broadcast so friends' clients update presence right away. |

### 2.5 Friends — `/api/friends`

| Method | Path                                   | Auth | Description                                                                                                                                                                                                                                                                                                                                                    |
| ------ | -------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /                                      | V    | `[{user, since}]` accepted friends, sorted by name (max 200; presence added in Phase 9)                                                                                                                                                                                                                                                                        |
| GET    | /requests?direction=incoming\|outgoing | V    | `[{id, user, createdAt}]` pending requests                                                                                                                                                                                                                                                                                                                     |
| POST   | /requests                              | V    | `{userId}` → 201 `{id, user, createdAt}`. Errors: yourself (400), missing/unverified/blocked either way (404 `NOT_FOUND`, indistinguishable), `ALREADY_FRIENDS`, `REQUEST_EXISTS`, `REQUEST_EXISTS_INCOMING` (with `details[0].issue` = their request id), declined less than 7 days ago (429). Simultaneous crossed requests leave exactly one. Limit 30/day. |
| POST   | /requests/:id/accept                   | V    | Recipient only → 204; anyone else 404. Notifies the requester.                                                                                                                                                                                                                                                                                                 |
| POST   | /requests/:id/decline                  | V    | Recipient only → 204. To the requester it simply looks like "no request".                                                                                                                                                                                                                                                                                      |
| DELETE | /requests/:id                          | V    | Requester only (cancel) → 204                                                                                                                                                                                                                                                                                                                                  |
| DELETE | /:userId                               | V    | Remove friend → 204 (404 if not friends)                                                                                                                                                                                                                                                                                                                       |
| GET    | /blocks                                | V    | `[{user}]` users I blocked                                                                                                                                                                                                                                                                                                                                     |
| POST   | /blocks                                | V    | `{userId}` → 204. Removes any friendship/request between us. The blocked person is not told.                                                                                                                                                                                                                                                                   |
| DELETE | /blocks/:userId                        | V    | Unblock → 204 (does **not** restore the friendship)                                                                                                                                                                                                                                                                                                            |

### 2.6 Conversations — `/api/conversations`

| Method      | Path                        | Auth | Description                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET         | /?cursor=&archived=         | V    | My conversations sorted by pinned, then last activity. Each item: `{id, peer, lastMessage (preview respects unsend/hidden/cleared), unreadCount, myState:{deliveredUpToSeq, readUpToSeq, mutedUntil, theme, pinnedAt, archivedAt}, peerState:{deliveredUpToSeq, readUpToSeq?}, canMessage}`. `readUpToSeq` is omitted when receipts are off for either user. |
| POST        | /                           | V    | `{peerUserId}` → get or create a direct conversation. Requires friendship. Repeatable.                                                                                                                                                                                                                                                                       |
| GET         | /:id                        | V    | One conversation (member only; otherwise 404)                                                                                                                                                                                                                                                                                                                |
| _(preview)_ | `GET /:id/messages?limit=4` | V    | The long-press preview reuses the history endpoint, which has **no side effects on read state**; the client simply never reports those messages as read (tested).                                                                                                                                                                                            |
| PATCH       | /:id/settings               | V    | `{mutedUntil?: ISO date \| null, accent?: teakhelet\|ocean\|forest\|sunset\|rose\|graphite \| null}` → my settings for this chat only; synced to my other devices (`conversation:updated`). Returns the summary (`myState.muted` computed by the server).                                                                                                    |
| POST        | /:id/clear                  | V    | Hide all current messages for me only (`clearedUpToSeq = lastSeq`, also marks them read).                                                                                                                                                                                                                                                                    |
| POST        | /:id/read                   | V    | `{upToSeq}` — REST fallback of the socket event; same rules                                                                                                                                                                                                                                                                                                  |
| GET         | /:id/pins                   | V    | Pinned messages (≤ 10, newest pin first)                                                                                                                                                                                                                                                                                                                     |

### 2.6a Groups — `/api/groups` (docs/GROUPS.md)

Group messages, history, receipts and chat settings use `/api/conversations` like direct chats; a
group summary has `type: "group"`, `peer: null` and `group: { name, photo, myRole, keyEpoch,
rotationNeeded, members[] }`. Every route answers 404 to non-members.

| Method | Path                   | Who    | Body / result                                                                    |
| ------ | ---------------------- | ------ | -------------------------------------------------------------------------------- |
| POST   | `/`                    | anyone | `{ name, memberIds (≥ 2 friends), keyBoxes }` → 201 group summary                |
| PATCH  | `/:id`                 | admin  | `{ name?, photoAttachmentId? \| null }`                                          |
| POST   | `/:id/members`         | admin  | `{ userIds, keyBoxes }` (every epoch, so they can read the history)              |
| DELETE | `/:id/members/:userId` | admin  | removes; the group then needs a new key                                          |
| PATCH  | `/:id/members/:userId` | admin  | `{ role: "admin" \| "member" }` (at least one admin stays)                       |
| POST   | `/:id/leave`           | member | 204; last admin → oldest member becomes admin; last member → group deleted       |
| GET    | `/:id/keys`            | member | my key boxes `{ keyEpoch, rotationNeeded, boxes: [{ epoch, fromUserId, box }] }` |
| POST   | `/:id/keys`            | member | `{ keyBoxes }`: share keys with members missing them                             |
| POST   | `/:id/keys/request`    | member | asks online members to share keys (`group:keys-needed`)                          |
| POST   | `/:id/keys/rotate`     | member | `{ epoch: current + 1, keyBoxes }` for every member                              |

Errors: `GROUP_KEY_ROTATION_NEEDED` / `GROUP_KEY_OUTDATED` (409) on sends with an old key,
`GROUP_FULL` (409) above 50 people. Socket events: `conversation:removed` (I left / was
removed), `group:keys-needed`.

### 2.7 Messages

| Method       | Path                                                           | Auth | Description                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | /api/conversations/:id/messages?before=seq \| after=seq&limit= | V    | Ordered by seq, bounded by limit. Excludes messages deleted for me or before my clear point. `replyTo` = `{id, senderId, text ≤ 120 \| null, unsent}`. Unsent messages keep their place with `text: null`. |
| POST         | /api/conversations/:id/messages                                | V    | REST fallback for sending: `{clientMessageId, type, text?, attachmentIds?, gif?, replyToId?}` → 201 new / 200 duplicate (idempotent)                                                                       |
| PATCH        | /api/messages/:id                                              | V    | `{text}` — sender only, type text, ≤ 15 min, not unsent                                                                                                                                                    |
| DELETE       | /api/messages/:id?scope=me\|everyone                           | V    | `me`: any member. `everyone`: sender only, ≤ 24 h.                                                                                                                                                         |
| PUT          | /api/messages/:id/reaction                                     | V    | `{emoji}` (single RGI emoji) — replaces my reaction                                                                                                                                                        |
| DELETE       | /api/messages/:id/reaction                                     | V    | Remove my reaction                                                                                                                                                                                         |
| PUT / DELETE | /api/messages/:id/pin                                          | V    | Any member. Max 10 pins per conversation (`INVALID_STATE` when full).                                                                                                                                      |

Message object returned to clients:

```json
{
  "id": "...",
  "conversationId": "...",
  "seq": 42,
  "senderId": "...",
  "clientMessageId": "uuid",
  "type": "text",
  "text": "hi",
  "attachments": [
    {
      "id": "...",
      "kind": "image",
      "mimeType": "image/jpeg",
      "width": 1200,
      "height": 900,
      "durationMs": null,
      "size": 284113
    }
  ],
  "gif": null,
  "replyTo": null,
  "reactions": [{ "userId": "...", "emoji": "❤️" }],
  "editedAt": null,
  "unsentAt": null,
  "pinnedAt": null,
  "version": 1,
  "createdAt": "2026-10-15T10:00:00.000Z"
}
```

Delivery/seen status is computed on the client from `seq` and the peer's watermarks. It isn't stored per message.

### 2.8 Search — `/api/search`

| Method | Path                                                     | Auth | Description                                                                                                                                                                                   |
| ------ | -------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /messages?q=&conversationId=&senderId=&from=&to=&cursor= | V    | `q` is 2–100 chars. Scope is always limited to my conversations. Excludes hidden, cleared, and unsent messages. Returns `{message, conversationId, highlights}`, limit 20. Rate limit 30/min. |

Limitations (documented for users):

- MongoDB text search matches **whole words** (no partial-word matches inside words), and it ignores case and diacritics.
- No fuzzy matching.
- Only text messages are searchable.
- If E2EE is ever added, server-side search becomes impossible and search would move to the device.

Upgrade path: Atlas Search (supported on M0 for a few indexes) for prefix/fuzzy matching.

Selecting a result opens the chat and loads older pages until the message is on screen, then highlights it. (Planned `around=` and `/changes` endpoints were not needed: after a reconnect the client reloads the newest page, and older pages reload when scrolled to.)

### 2.9 Media — `/api/media`

| Method | Path                                     | Auth | Description                                                                                                                                                                                             |
| ------ | ---------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | /uploads                                 | V    | `{purpose: message\|avatar, conversationId?, mimeType, size}` → 201 `{attachmentId, kind, upload:{url, method, fields}, expiresAt}`. Rate limit 120/h.                                                  |
| POST   | /uploads/:id/complete                    | V    | Owner only → verifies the stored object → `{attachment}` or 422 `INVALID_MEDIA` (object deleted)                                                                                                        |
| DELETE | /uploads/:id                             | V    | Owner cancels an upload that hasn't been sent (file deleted) → 204                                                                                                                                      |
| GET    | /:id?variant=thumb\|full\|poster\|avatar | V    | Authorization (see DATABASE.md §2.9) → **302** to a signed provider URL. `Cache-Control: private, no-store` on the redirect. 404 if not allowed (also for unsent, deleted-for-me and cleared messages). |
| POST   | /local-upload                            | V    | **Development/test storage only** (`MEDIA_STORAGE=local`): multipart `token` + `file`; stands in for Cloudinary's upload URL.                                                                           |
| GET    | /local-file/:name?exp&sig                | –    | Development/test storage only: serves a file for a signed link that expires after 5 minutes.                                                                                                            |

Upload flow: `POST /uploads` → the browser POSTs `upload.fields` plus the file (multipart field `file`) straight to `upload.url` → `POST /uploads/:id/complete` (optional `{width, height, durationMs}` hints, used only when the storage can't measure the file). Checks: type allowlist (415 `UNSUPPORTED_MEDIA_TYPE`); 10 MB photos and 100 MB videos (413 `TOO_LARGE`); member + friends for message uploads; at most 30 unsent uploads per user; the real format detected from the stored bytes (422 `INVALID_MEDIA`, file deleted). Uploads not sent within 24 h are deleted by the cleanup job. 503 `PROVIDER_UNAVAILABLE` when no storage is configured.

Profile photo: `PUT /api/users/me/avatar {attachmentId}` (a ready upload with `purpose: avatar`) → `{user}`, and the previous photo is deleted. `DELETE /api/users/me/avatar` removes it. User objects carry `avatar: "/api/media/<id>?variant=avatar&v=<version>" | null`. People who blocked each other get 404 for each other's photo.

### 2.10 GIFs — `/api/gifs`

| Method | Path    | Auth | Description                                                                                                                                                                                                                                                                                                                |
| ------ | ------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /config | V    | `{available: false}` or `{available: true, provider: 'klipy', appKey, customerId}`. **Changed in Phase 8:** KLIPY's terms forbid proxying, so the browser calls `https://api.klipy.com/api/v1/<appKey>/gifs/search` and `/trending` directly with `content_filter=high`. `customerId` is an anonymous hash of the user id. |

Sending a GIF: `message:send` with `gif: {provider: 'klipy', id, title, url, previewUrl, width, height}` and no text or attachments. `url` and `previewUrl` must be `https://static.klipy.com/...` (400 otherwise).

### 2.11 Notifications — `/api/notifications`

| Method | Path              | Auth | Description                                                                                                                                                             |
| ------ | ----------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /vapid-public-key | S    | Public key only                                                                                                                                                         |
| POST   | /subscriptions    | S    | `{endpoint, keys:{p256dh, auth}}` → upsert by endpoint and bind it to the current user + session. Re-binds a subscription that was previously owned by another session. |
| DELETE | /subscriptions    | S    | `{endpoint}` — own subscriptions only                                                                                                                                   |
| GET    | /                 | V    | `{items: [{id, type: friend_request\|friend_accepted, actor, createdAt, readAt}], unreadCount}` (latest 50, kept 90 days)                                               |
| POST   | /read             | V    | `{ids: [...]}` or `{all: true}` → 204. Only my own notifications are affected.                                                                                          |

## 3. Socket.IO contract

**Connection:** path `/socket.io`, same origin, cookie auth (ARCHITECTURE.md §5). Transports: WebSocket with HTTP long-polling fallback. `maxHttpBufferSize` is 64 KB.

**Ack format** for every client→server event: `{ ok: true, data? } | { ok: false, error: { code, message } }`. Clients use a 10 s ack timeout.

**Event names** are defined once in `shared/src/events.js`.

### 3.1 Client → Server

| Event                          | Payload (Zod, strict)                                                                         | Authorization                                                                                          | Ack data             | Rate limit         | Idempotency / retry                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `message:send`                 | `{conversationId, clientMessageId: uuid, type, text?, attachmentIds?: ≤10, gif?, replyToId?}` | member + friends + not blocked + verified; attachments owned, ready, and created for this conversation | `{message}`          | 30 / 10 s per user | Unique `(senderId, clientMessageId)` → a retry returns the original message. Client retries with the same id. |
| `message:delivered`            | `{conversationId, upToSeq: int ≥ 0}`                                                          | member. `upToSeq` is clamped to `lastSeq`.                                                             | `{deliveredUpToSeq}` | 60 / 10 s          | `$max` → repeats are harmless                                                                                 |
| `conversation:read`            | `{conversationId, upToSeq}`                                                                   | member. Clamped.                                                                                       | `{readUpToSeq}`      | 60 / 10 s          | `$max`                                                                                                        |
| `typing:start` / `typing:stop` | `{conversationId}`                                                                            | member + can message                                                                                   | – (no ack needed)    | 1 / s              | none needed                                                                                                   |
| `presence:visibility`          | `{visible: boolean}`                                                                          | authenticated                                                                                          | –                    | 2 / s              | last write wins                                                                                               |

Unknown events are ignored and logged at debug level. Repeated invalid payloads (more than 20/min) disconnect the socket.

### 3.2 Server → Client

| Event                    | Sent to                             | Payload                                                                             | Client behavior                                                                                                                        |
| ------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `message:new`            | `user:<sender>`, `user:<recipient>` | `{message}`                                                                         | Merge by id/clientMessageId; recipient sends `message:delivered`                                                                       |
| `message:updated`        | both users                          | `{message}` (edit, unsend tombstone, reactions, pin)                                | Replace if `version` is newer                                                                                                          |
| `message:hidden`         | `user:<actor>` only                 | `{conversationId, messageId}`                                                       | Remove locally ("delete for me" on my other devices)                                                                                   |
| `receipt:update`         | the other member                    | `{conversationId, userId, deliveredUpToSeq, readUpToSeq?}`                          | Update ticks (`readUpToSeq` omitted if receipts are disabled)                                                                          |
| `conversation:updated`   | `user:<me>`                         | `{conversation}` (new conversation, my settings changed on another device, cleared) | Update cache                                                                                                                           |
| `conversation:read-sync` | `user:<me>`                         | `{conversationId, readUpToSeq}`                                                     | Clear unread on my other devices                                                                                                       |
| `typing:update`          | the other member                    | `{conversationId, userId, isTyping}`                                                | Show indicator; auto-expire after 6 s                                                                                                  |
| `presence:update`        | allowed friends                     | `{userId, online, lastSeenAt \| null}`                                              | Update status                                                                                                                          |
| `friendship:updated`     | both users                          | `{userId, relationship, requestId?}`                                                | Invalidate friend queries                                                                                                              |
| `notification:new`       | `user:<me>`                         | `{notification}`                                                                    | Show in-app toast + feed badge                                                                                                         |
| _(disconnect)_           | sockets of an ended session         | reason `io server disconnect`                                                       | Logout, revoke, password change and account deletion close that session's sockets; the client re-checks its session and goes to login. |

**Implementation status (Phase 9A):**

- Implemented: `message:send`, `message:delivered`, `conversation:read`, `typing:start/stop`; `message:new`, `receipt:update`, `conversation:read-sync`, `typing:update`, `friendship:updated`, `notification:new`.
- Behavior details:
  - **Replying marks the conversation as read** up to your message (the other person's ticks turn "seen").
  - Delivered receipts are sent only over the socket.
  - The send limit is per connection (30 / 10 s) for sockets and per user for the REST fallback.
- Phase 7 added `message:updated`, `message:hidden` and `conversation:updated`.
- **Phase 9A — presence:**
  - The handshake carries `auth: {visible}`.
  - `presence:visibility {visible}` reports a tab being hidden or shown again.
  - `presence:refresh {}` asks for a new snapshot, e.g. after a friendship change.
  - On every connect the server sends `presence:snapshot {users: [{userId, online, lastSeenAt}]}`, which replaces the client's whole map. `presence:update` then carries changes.
  - `null` means hidden by privacy. Both settings are reciprocal: if you hide yours, you can't see others'.
  - "Offline" is announced 8 s after the last visible device goes away (`PRESENCE_OFFLINE_DELAY_MS`); reconnecting within that time announces nothing.
  - Presence lives in memory on the single instance.

Server→client events are hints about change, not the source of truth. If anything is missed while the client is offline, it's recovered by the reconnect sync (ARCHITECTURE.md §7).

## 4. Rate limits (initial values, tuned in Phase 10)

| Scope                                 | Limit                                                |
| ------------------------------------- | ---------------------------------------------------- |
| Login                                 | 5 / 15 min per (IP + identifier); 50 / 15 min per IP |
| Register                              | 5 / h per IP                                         |
| Forgot password / resend verification | 3 / h per email and 10 / h per IP                    |
| Search users                          | 60 / min per user                                    |
| Search messages                       | 30 / min per user                                    |
| Send message                          | 30 / 10 s per user (socket + REST share the bucket)  |
| Friend requests                       | 30 / day per user                                    |
| Upload init                           | 60 / h per user                                      |
| Everything else                       | 300 / min per user                                   |
