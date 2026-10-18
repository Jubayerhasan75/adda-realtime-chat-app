# Testing Strategy (Phase 1)

Status: **Plan only.** No tests exist yet. Results are recorded in `docs/STATUS.md` after each phase, and only from commands that were actually run.

## 1. Tools

| Layer                 | Tool                                                                                                                                                                                                           | Where                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Unit (server, shared) | Vitest                                                                                                                                                                                                         | `server/tests/unit`, `shared/src/**/*.test.js` |
| API integration       | Vitest + Supertest + mongodb-memory-server (replica set, so transactions run for real)                                                                                                                         | `server/tests/integration`                     |
| Real-time             | Vitest + in-process server + `socket.io-client` (several clients = several users/devices)                                                                                                                      | `server/tests/socket`                          |
| Components            | Vitest + React Testing Library + jsdom                                                                                                                                                                         | `client/src/**/*.test.jsx`                     |
| End-to-end            | Playwright against the **production build** served by the server, with a test DB. Two browser contexts = two users. Projects: Desktop Chromium, Mobile Chrome (Pixel), Mobile Safari (WebKit, iPhone viewport) | `e2e/`                                         |
| Static checks         | ESLint (incl. `react-hooks`, `import/no-cycle`, no `dangerouslySetInnerHTML`), Prettier check                                                                                                                  | root                                           |
| Dependencies          | `npm audit`                                                                                                                                                                                                    | root                                           |

Root scripts (created in Phase 2): `npm run lint`, `npm test` (all Vitest projects), `npm run test:e2e`, `npm run build`, `npm run check` (lint + test + build).

## 2. Test doubles policy

- **Database:** always a real `mongod`, from mongodb-memory-server. There is no fake persistence.
- **Email:** a `memory` mail transport, used only when `NODE_ENV=test`. Tests read the captured verification/reset links from it. E2E reads them from a test-only endpoint that is **not registered** outside `NODE_ENV=test`. In local dev without SMTP credentials, a clearly labelled `console` transport prints links to the terminal. Production refuses to start without a real transport.
- **Media storage:** a test provider implementing the same interface, with real byte checks against fixture files (a valid JPEG, a PNG, an MP4, a text file renamed `.jpg`, an oversize file). Real provider tested manually and in a staging smoke test.
- **Push:** the `web-push` sender is stubbed to record calls. Tests check:
  - who gets a push and when (mute, visibility, privacy preview)
  - that 404/410 responses delete the subscription
  - that a push failure doesn't affect the message

  Real delivery is tested manually on devices.

- **GIF provider:** stubbed HTTP responses. Also tests the "not configured → 503 → UI fallback" path.

## 3. What gets tested per area

| Area               | Unit                                                                         | Integration / socket                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation schemas | valid/invalid cases, unknown keys rejected, emoji validation, username rules | 400 shapes                                                                                                                                                                                                          |
| Auth               | password policy, token hashing, cookie options                               | register → verify → login → session → logout; reset revokes sessions; reauth window; login rate limit; enumeration-safe responses                                                                                   |
| Friendships        | state machine (every allowed/forbidden transition)                           | concurrent crossed requests; block side effects; cooldown                                                                                                                                                           |
| Messages           | seq/receipt computation, edit/unsend windows                                 | idempotent send (same clientMessageId twice → one message); pagination before/after/around; edit/unsend/hide/react/pin rules; unread counts                                                                         |
| Receipts           | watermark merge (`$max`, clamping)                                           | delivered only after client ack; seen only after `conversation:read`; **preview endpoint does not change readUpToSeq**; receipts hidden when disabled                                                               |
| Real-time          | –                                                                            | two devices of one user both get `message:new`; reconnect + sync recovers missed messages; duplicate events ignored; typing expiry on disconnect; presence stays online while one tab remains; offline grace period |
| Media              | MIME/magic-byte checks                                                       | upload init limits; complete rejects a disguised file; non-member gets 404 on `/media/:id`; unsend deletes media                                                                                                    |
| Notifications      | preview text builder for each privacy mode                                   | muted conversation → no push; visible client → no push; own message → no push                                                                                                                                       |
| Search             | query building/escaping                                                      | results limited to my conversations; hidden/unsent excluded                                                                                                                                                         |

## 4. Authorization test matrix (security-critical — must pass every phase from 5 on)

For each protected REST route and socket event, an automated test checks that each of these actors is refused:

| Actor                                                                                               | Expected                                         |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Not logged in                                                                                       | 401 / `connect_error`                            |
| Logged in, email not verified                                                                       | 403 `EMAIL_NOT_VERIFIED`                         |
| Logged in, not a member of the conversation                                                         | 404 (no existence leak)                          |
| Member, but no longer friends                                                                       | 403 `NOT_FRIENDS` for send; read history allowed |
| Blocked by the other user                                                                           | 403 `NOT_FRIENDS` (block indistinguishable)      |
| Forged fields (`senderId`, `userId`, foreign `attachmentId`, `replyToId` from another conversation) | ignored or 400/404                               |
| Missing/invalid CSRF token or foreign Origin                                                        | 403                                              |

## 5. End-to-end journeys (from the master prompt)

1. Register and verify an account (verification link read from the test mail capture)
2. Log in, refresh, still logged in
3. Search for another user
4. Send and accept a friend request (second browser context)
5. Start a conversation
6. Send text and observe sending → sent → delivered → seen
7. Send an image and a video (fixtures)
8. Edit, delete for me, unsend, pin, search messages
9. Long-press preview of an unread chat → sender still sees "delivered", not "seen"
10. Notifications: in-app feed + push subscription created (real push delivery: manual only)
11. Change theme, conversation accent, display name, avatar
12. Log out → protected routes redirect to login, socket closed

## 6. Manual test checklist (cannot be automated here)

- Real iPhone (iOS ≥ 16.4): Add to Home Screen, enable notifications, receive a push while closed, tap it to open the right chat, keyboard + safe areas, photo/video picking (HEIC/HEVC).
- Real Android Chrome: install, push, back-button behavior, keyboard resize.
- Desktop Chrome/Edge/Firefox/Safari: layout, keyboard navigation, push.
- Flaky network: Chrome DevTools offline/slow 3G while sending, and a real phone switching Wi-Fi ↔ mobile data.

I can run Playwright's WebKit locally, but **WebKit on Windows is not iOS Safari**. Push, install, and keyboard behavior on iPhone can only be verified on your device. These results will be recorded as "manual — reported by user".

## 7. Phase gate (Definition of Done check, every phase)

1. `npm run lint` passes.
2. `npm test` passes (new tests included for the phase's features).
3. `npm run build` passes.
4. Affected E2E journeys pass (from Phase 4 onward).
5. Browser console has no errors on the changed screens. Server logs have no unexpected errors.
6. Responsive check at 360, 390, 768, and 1440 px widths.
7. Docs updated (API/DATABASE/STATUS).
8. Anything unverified is listed explicitly in STATUS.md.
