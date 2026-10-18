# Phase 0 — Requirements and Feasibility

Status: **Draft for approval** (2026-10-15). Nothing in this document has been implemented yet.

## 1. Product summary

A private, invite-by-friendship, one-to-one messaging web app (working name **"Adda"**, final name TBD).
Users register with a verified email and a unique username, find each other by username, become friends,
and then exchange text, emoji, GIFs, photos, and videos in real time. The app is installable as a PWA on
Android, iOS/iPadOS 16.4+, and desktop, with Web Push notifications. Privacy is the top priority: only
friends can message each other, presence/last-seen/read receipts are user-controlled, and every request
and socket event is authorized on the server.

Its visual identity is original: Teakhelet `#592E83` primary, light/dark themes, per-conversation accents.
It does not copy Messenger/WhatsApp/Instagram branding or layout.

## 2. Feature inventory

Legend: **MVP** = required for first release · **Later** = designed for, built after MVP is verified ·
**Out** = explicitly out of scope for the first release.

### 2.1 Accounts and sessions

| Feature                                                    | Scope | Notes                                                                |
| ---------------------------------------------------------- | ----- | -------------------------------------------------------------------- |
| Register (email, username, display name, password)         | MVP   | Email enumeration-safe responses                                     |
| Email verification                                         | MVP   | Unverified users can log in but cannot use social/messaging features |
| Login with email **or** username                           | MVP   |                                                                      |
| Logout (current device)                                    | MVP   |                                                                      |
| Persistent sessions (HttpOnly cookie, server-side session) | MVP   | Policy in SECURITY.md §4                                             |
| Forgot / reset password                                    | MVP   | Reset revokes all sessions                                           |
| Change password                                            | MVP   | Revokes other sessions                                               |
| Change email (re-verify new address)                       | MVP   |                                                                      |
| Active sessions list + revoke one / all others             | MVP   |                                                                      |
| Re-authentication for sensitive actions                    | MVP   | Current password required in the same request                        |
| Profile: display name, bio, avatar upload/replace/remove   | MVP   |                                                                      |
| Username change (unique, rate-limited)                     | MVP   | Max once per 7 days                                                  |
| Account deletion                                           | MVP   | Retention rules in DATABASE.md §5                                    |
| Account data export (JSON)                                 | Later | Phase 10 stretch                                                     |
| 2FA (TOTP / passkeys)                                      | Later | Architecture leaves room                                             |

### 2.2 Friends and safety

| Feature                                         | Scope                                |
| ----------------------------------------------- | ------------------------------------ |
| Username search (exact + prefix)                | MVP                                  |
| Public profile card (no private data)           | MVP                                  |
| Send / accept / decline / cancel friend request | MVP                                  |
| Remove friend                                   | MVP                                  |
| Block / unblock                                 | MVP                                  |
| Report user or message                          | MVP (stored for review; no admin UI) |
| Real-time friendship updates                    | MVP                                  |
| Moderator/admin dashboard                       | Later                                |
| "People you may know" / contacts import         | Out                                  |

### 2.3 Messaging (one-to-one)

| Feature                                              | Scope                                   |
| ---------------------------------------------------- | --------------------------------------- |
| Direct conversation (friends only)                   | MVP                                     |
| Text messages with emoji (Unicode)                   | MVP                                     |
| Sending → Sent → Delivered → Seen states             | MVP                                     |
| Typing indicator, online/offline, last seen          | MVP                                     |
| Unread counts                                        | MVP                                     |
| Edit (sender, text only, 15-min window)              | MVP                                     |
| Delete for me                                        | MVP                                     |
| Unsend / delete for everyone (sender, 24-h window)   | MVP                                     |
| Reactions (one emoji per user per message)           | MVP                                     |
| Reply to message                                     | MVP                                     |
| Pin / unpin (max 10 per conversation) + pinned bar   | MVP                                     |
| Copy text, multi-select, context menu                | MVP                                     |
| Message search (current conversation + all)          | MVP                                     |
| Cursor pagination, reconnect sync, multi-device sync | MVP                                     |
| Per-conversation mute and theme/accent               | MVP                                     |
| Long-press unread preview (no read receipt)          | MVP                                     |
| Clear chat history for me                            | MVP                                     |
| Forward message                                      | Later                                   |
| Link previews (server-side unfurl)                   | Later (SSRF risk; needs careful design) |
| Message scheduling, disappearing messages            | Later                                   |
| Group chats                                          | Out                                     |
| Voice messages, voice/video calls                    | Out                                     |
| Stories, feeds, public posts                         | Out                                     |

### 2.4 Media and GIFs

| Feature                                             | Scope                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Photo + video selection (gallery file picker)       | MVP                                                                             |
| Preview before send, upload progress, cancel, retry | MVP                                                                             |
| Server-side validation (size, type, magic bytes)    | MVP                                                                             |
| Authorized media delivery (participants only)       | MVP                                                                             |
| Thumbnails / posters, fixed aspect placeholders     | MVP                                                                             |
| Full-screen image viewer, inline video player       | MVP                                                                             |
| GIF search + send (server-proxied provider)         | MVP if a provider key is configured; otherwise a clear "GIFs unavailable" state |
| Camera capture inside app                           | Later (file picker already offers camera on mobile)                             |
| Documents / arbitrary files                         | Out                                                                             |

### 2.5 Notifications, presence, PWA

| Feature                                                              | Scope                                    |
| -------------------------------------------------------------------- | ---------------------------------------- |
| In-app notification feed (friend requests, accepts, security events) | MVP                                      |
| Web Push for messages, friend requests, accepts                      | MVP                                      |
| Private notification previews setting                                | MVP                                      |
| App badge (Badging API where supported)                              | MVP                                      |
| Installable PWA, offline fallback page, update prompt                | MVP                                      |
| iOS Home Screen install guide                                        | MVP                                      |
| Native Android/iOS wrapper (Capacitor)                               | Later — architecture prepared, not built |

### 2.6 Design

| Feature                                                           | Scope |
| ----------------------------------------------------------------- | ----- |
| Design tokens, light/dark, persisted theme                        | MVP   |
| Mobile layout (list ↔ chat, bottom nav)                           | MVP   |
| Desktop 3-column layout                                           | MVP   |
| Reduced-motion support, keyboard navigation, screen-reader labels | MVP   |

## 3. Decisions I made (sensible defaults — change any of them if you disagree)

| #   | Decision                                                                                                                                                                                                                                                                                 | Reason                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Messaging requires an accepted friendship** and no block in either direction. After unfriending, history stays readable but sending is disabled.                                                                                                                                       | "Private" platform; prevents spam from strangers.                                                                             |
| D2  | Unverified users can log in but only see a "verify your email" screen and settings.                                                                                                                                                                                                      | Users aren't locked out if the email is delayed; abuse still blocked.                                                         |
| D3  | Username search is **exact or prefix** match (e.g. `jub` finds `jubayer`), not "contains".                                                                                                                                                                                               | Prefix search uses an index; "contains" needs a full scan.                                                                    |
| D4  | Users can hide themselves from search (`discoverable: false`); then only an exact username match finds them.                                                                                                                                                                             | Privacy control.                                                                                                              |
| D5  | **Delivered** = a recipient device's app acknowledged the message (socket ack or after a REST fetch it processed). **Seen** = the recipient had the conversation open, visible, and scrolled to the message. Both are per-conversation watermarks.                                       | Precise, cheap, and correct across multiple devices. See ARCHITECTURE.md §6.                                                  |
| D6  | Read receipts and last-seen are **reciprocal**: if you turn them off, you also can't see other people's.                                                                                                                                                                                 | Same fairness model as WhatsApp; avoids one-sided surveillance.                                                               |
| D7  | Unsend replaces the message with a tombstone ("Message unsent") for both users and deletes its content and media from the server. It can't recall a push notification that was already shown.                                                                                            | Honest, well-defined behavior.                                                                                                |
| D8  | Edits keep no history; an "edited" label is shown.                                                                                                                                                                                                                                       | Privacy and simplicity.                                                                                                       |
| D9  | When an account is deleted, its profile, sessions, friendships, settings, push subscriptions, and pending uploads are deleted. Messages the account sent **remain in the other person's history**, attributed to "Deleted account". A conversation is purged when both members are gone. | Protects the recipient's copy of their own chat, as most messengers do.                                                       |
| D10 | Push notifications are sent only when the recipient has **no visible app window** open. iOS requires every push to show a notification, so suppressing pushes must happen on the server.                                                                                                 | Avoids duplicate alerts and keeps iOS from revoking the subscription.                                                         |
| D11 | Notification preview default = **sender name only, no message text**. The user can choose "name + text" or "nothing".                                                                                                                                                                    | Privacy-first default.                                                                                                        |
| D12 | **No end-to-end encryption in v1.** TLS in transit + provider encryption at rest. Documented clearly.                                                                                                                                                                                    | See SECURITY.md §7 for the full trade-off.                                                                                    |
| D13 | The frontend, API, and Socket.IO are served from a **single origin** (one Node service serves the built React app).                                                                                                                                                                      | Avoids Safari third-party-cookie blocking, which breaks cross-site cookie auth on iPhone. CORS/CSRF also become much simpler. |
| D14 | Limits (configurable via env): text 4,000 chars; 10 attachments per message; images ≤ 15 MB; videos ≤ 100 MB; avatar ≤ 5 MB.                                                                                                                                                             | Matches common free-tier storage limits.                                                                                      |

## 4. Resolved questions (2026-10-16)

The plan was approved with one hard constraint: **zero cost**. Every library, API, and service must be free, and no service may require a payment card.

| #   | Question      | Decision                                                                                                                                    |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Language      | JavaScript (ES modules) + JSDoc + shared Zod schemas                                                                                        |
| Q2  | Media storage | **Cloudinary free plan** (no card). Cloudflare R2 is ruled out because activating it requires a payment method.                             |
| Q3  | Email         | No domain assumed → **Brevo free** (single verified sender) or **Gmail SMTP with an app password**. Both are free. Chosen in Phase 4.       |
| Q4  | Hosting       | **Free tier that sleeps** (e.g. Render free). The cold-start delay is an accepted, documented limitation. Paid upgrades are not considered. |
| Q5  | Decisions     | D1–D14 accepted as written.                                                                                                                 |
| –   | GIFs          | Only a provider with a free API key; otherwise the feature is disabled gracefully.                                                          |

## 5. Platform constraints (researched; re-verify on real devices)

- **iOS Web Push** works only for web apps **added to the Home Screen** on iOS/iPadOS 16.4+. Safari tabs can't receive pushes. Permission must be requested from a user gesture. Every push must show a visible notification. Notification action buttons aren't supported on iOS. Badging works for Home Screen apps.
- **iOS cookies:** Safari's ITP blocks third-party cookies, which is the reason for D13.
- **iOS video/photo formats:** iPhones record HEVC/HEIC. Safari usually converts HEIC photos to JPEG when they're picked through `<input type=file>`, but HEVC videos may not play on many Android or desktop browsers unless they're transcoded. This is a major reason for the Cloudinary recommendation.
- **iOS virtual keyboard:** `100vh` is unreliable. Use `100dvh`, `visualViewport`, and `env(safe-area-inset-*)`.
- **Background execution:** A PWA has no background socket. When it's closed, push is the only way to reach the user.
- **Tooling found on this PC:** Node 22.17.1. The current `react-router@8` needs Node ≥ 22.22. Upgrade to **Node 24 LTS (24.22.0)** before Phase 2.

## 6. Global acceptance criteria (release level)

1. All 12 E2E journeys from the master prompt pass in Playwright against a production build. Push delivery is tested manually.
2. No API endpoint or socket event lets user A read or modify user B's private data. Covered by automated authorization tests.
3. A message acknowledged as **Sent** is never lost. A message is never duplicated after retries or reconnects. Covered by tests.
4. The unread preview never changes `readUpToSeq` or sends a seen receipt. Covered by a test.
5. Mobile layouts at 360×640, 390×844 (iPhone), and 768×1024, and a desktop layout at 1440×900, have no horizontal overflow, and the composer stays visible with the keyboard open. Checked manually on a real iPhone + Android before release.
6. The production build, lint, and all automated tests pass. `npm audit` shows no unresolved high/critical issues.
7. SECURITY.md checklist completed; known limitations documented.

## 7. Risk register

| ID  | Risk                                                                                       | Likelihood               | Impact   | Mitigation                                                                                                 |
| --- | ------------------------------------------------------------------------------------------ | ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| R1  | iOS Web Push quirks (install requirement, revoked subscriptions, no actions)               | High                     | Medium   | Capability detection, install guide, `userVisibleOnly`, re-subscribe on load, real-device test in Phase 11 |
| R2  | Safari blocks cross-site auth cookies                                                      | High (if split origins)  | High     | D13 single origin                                                                                          |
| R3  | HEVC videos unplayable on other devices                                                    | High                     | Medium   | Cloudinary transcoding, or an "unsupported format" fallback + download if R2 is chosen                     |
| R4  | Free hosting sleeps → cold start delays, dropped sockets                                   | High (free tier)         | Medium   | Client reconnect + sync; documented; paid tier for real use                                                |
| R5  | Duplicate/lost messages on flaky mobile networks                                           | Medium                   | High     | `clientMessageId` idempotency, persisted outbox, seq-based sync, tests                                     |
| R6  | Authorization gaps (IDOR)                                                                  | Medium                   | Critical | Central `assertMember`/`assertCanMessage` services, no client-joinable rooms, authz test matrix            |
| R7  | Malicious uploads                                                                          | Medium                   | High     | Signed upload params, server-side verification (size, magic bytes), no direct public URLs, strict CSP      |
| R8  | MongoDB M0 limits (512 MB storage, connection caps, shared CPU)                            | Medium                   | Medium   | Lean documents, indexes, media stored outside DB, upgrade path                                             |
| R9  | Email deliverability (spam folder, no domain)                                              | Medium                   | Medium   | Domain-verified provider (or Brevo sender verification), resend flow, dev outbox for testing               |
| R10 | Package churn (new majors: Vite 8, React Router 8, Mongoose 9, Zod 4, Vitest 5, ESLint 10) | Medium                   | Medium   | Pin exact versions, read migration notes in Phase 2, lockfile committed                                    |
| R11 | In-memory presence/rate limits break with more than one server instance                    | Low (v1 single instance) | Medium   | Documented; Redis adapter + store in the scaling path                                                      |
| R12 | GIF provider terms/API changes                                                             | Medium                   | Low      | Server proxy behind an interface; feature disabled gracefully when unavailable                             |
| R13 | Capacitor wrapper can't use cookie auth across origins                                     | Medium (later)           | Medium   | Platform service layer; native auth strategy evaluated before wrapping                                     |
| R14 | Scope creep vs. quality                                                                    | High                     | High     | Strict phase gates, Definition of Done                                                                     |
