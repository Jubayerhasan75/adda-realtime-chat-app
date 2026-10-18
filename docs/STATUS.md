# Project Status

## Current phase: 10 — end-to-end encryption, parts 1–2 done (keys, encrypted messages); next: part 3 (encrypted photos/videos + Download), part 4 (notification previews, safety numbers), then the security review

### 2026-10-18 — Settings redesign, welcome screen, delete chat

- Settings grouped like Messenger: profile card → Edit profile (photo, Name, Username, Bio pages), Install Adda (one tap), Preferences (Appearance, Notifications, Privacy), Account (Email, Password, Where you’re signed in), About & updates, Log out, Delete account. Each opens as its own page (`/settings/...`) with a back arrow.
- Passwords are never displayed: PasswordField has no reveal toggle and Edge's `::-ms-reveal` button is hidden. Change password has a confirm field.
- Lock-screen preview example now reads “Jubayer: …”.
- Empty Chats list: “Welcome to Adda” + Find friends (no friends) or “Start a chat” with your friends.
- Delete chat (long-press preview and chat options) removes the chat from my list only; long-press preview shows sent photos/GIFs.
- Tests: new e2e/settings.spec.js and client AccountForms tests. Note: drive C: is nearly full (3.7 GB), which can make Playwright trace files fail to save.

### 2026-10-18 — End-to-end encryption, parts 1–2 (docs/E2EE.md)

**Decided with you:**

- encrypt everything (photos/videos too, next part);
- recovery passphrase for new devices;
- delete the unencrypted test messages;
- add a Download button.

**Completed**

- **Keys:**
  - P-256 identity key per person; the device keeps a non-extractable copy.
  - Backup locked with the recovery passphrase (Argon2id 64 MiB + AES-256-GCM, in a short-lived Web Worker).
  - "Protect your chats" / "Unlock your chats" / "Forgot passphrase → reset" screens.
  - Resetting keys needs the account password and sends an email; friends are told.
- **Messages:**
  - The server accepts **only encrypted envelopes** and rejects plain text (tested: the database never contains the words).
  - Text, edits, replies and GIF choices are encrypted. Each envelope is bound to its chat, sender and message id (tampering is detected).
  - Search runs on the device; server search was removed.
  - A message that can't be decrypted on this device shows a lock placeholder.
- The old unencrypted dev data was deleted with `scripts/wipe-dev-messages.mjs` (1 chat, 31 messages, 1 photo + its Cloudinary file). Accounts and friendships were kept. Your dev database is named "test", because the connection string has no database name.
- Name is exactly "Adda" everywhere (manifest description, package name, email sign-off).

**Bugs found and fixed**

- The strict security policy blocked WebAssembly, so unlocking silently failed. Fixed with `'wasm-unsafe-eval'`, which allows WebAssembly only: `eval()` and inline scripts stay blocked (tested).
- Argon2 kept 64 MiB of memory after unlocking. It now runs in a worker that is closed afterwards.
- A message arriving between loading the chat list and connecting wasn't marked "Delivered" until the next event. The list is now refreshed on connect.
- "Edit" disappeared for encrypted messages. Fixed.
- The setup tip showed a copyable example passphrase. Removed.
- Random E2E failures: the "real update" test rebuilt the app while other tests ran in parallel. It now runs alone, last. The test database also gets more time to start.

**Checks:** `npm run check` passed (**356/356**). E2E **42/42** three runs in a row, with real keys: test accounts set up encryption exactly like the app, messages between browsers are really encrypted, and each browser unlocks with its passphrase. Unlock takes ~0.4 s in the browser.

### 2026-10-17 — Phase 10 (part 1): Adda, updates, Vercel + Render readiness

**Completed**

- **Renamed to Adda** everywhere:
  - screens, browser tab, installed-app name/short name, notifications, emails (including the sender name in your `server/.env`);
  - the manifest `id` is unchanged, so installed apps update in place (Chrome/Edge show a short "app name changed" confirmation the next time they open);
  - the device's offline message store keeps its internal name, so unsent messages aren't lost.
- **Updates:**
  - the app checks for a new version whenever it's opened or brought back to the screen (and every 30 min);
  - banner "A new version of Adda is ready — Later / Update";
  - "What's new" once after updating (`client/src/releaseNotes.js`);
  - Settings → **About & updates** shows the version + build and has **Check for updates**.
  - How to release one: SETUP.md "Releasing an update".
- **Hosting decided: Vercel (app) + Render (server)** — ARCHITECTURE.md §10:
  - one-time socket tickets;
  - Socket.IO CORS limited to our app;
  - `VITE_SOCKET_URL`;
  - the shared security policy;
  - `scripts/vercel-config.mjs` writes `vercel.json` (rewrites, CSP, HSTS, frame/nosniff/referrer/permissions/COOP/CORP, no-cache for the service worker and app shell).

**Checks:** `npm run check` passed (**346/346** tests).

- New tests: tickets 6 (no cookie needed, single use, made-up/signed-out/other-site refused, 60 s expiry, CSRF/auth required), vercel.json 4, update banner "Later" and "What's new".
- E2E **42/42**, including a **real update**: the app is open, a new build is published, the banner appears on return, Update → the new build is running.

**Not verified yet:** the Vercel + Render setup itself (Phase 11).

### 2026-10-17 — Phase 9C: push notifications

**Completed**

- **Web Push (free, no account):** a VAPID key pair was generated on your computer and written straight into `server/.env` (never shown).
- **Subscriptions:**
  - Each one belongs to the login session that created it, so logout, revoking a session, a password change or deleting the account removes it, and a signed-out device never gets messages.
  - Only real push services are accepted (Google, Apple, Mozilla, Microsoft), which prevents request forgery.
  - Dead subscriptions (404/410) are deleted; others after 5 failures. Only the push service's host is logged.
- **Rules (unit-tested):**
  - No push while the app is on screen (no duplicates), for muted chats, when notifications are off, or to the sender.
  - Lock-screen preview follows the setting: name + text / name only (default) / nothing.
  - Photos and GIFs show as labels. Friend requests and acceptances have their own switch.
  - One notification per chat (a newer one replaces it).
- **App:**
  - The service worker always shows the notification (an iPhone requirement), sets the app-icon badge, and on tap opens that chat in the already-open app (no reload) or a new window.
  - **Settings → Notifications:** per-device "Turn on / off on this device", with "install first" on iPhone and how to unblock if blocked. Account switches and the preview choice.
  - Subscriptions are re-synced after every login, and the app-icon badge clears when the app is opened.
- **Found by my checks and fixed:**
  - Settings switches only moved after the server answered (laggy). All settings now change instantly and roll back with an error if saving fails.
  - Notifications couldn't be tried on a computer because `npm run dev` has no service worker. Added `npm run app:local`: the real built app on http://localhost:4000 with your .env. It was verified to start with Gmail and Cloudinary OK and the right security headers.

**Checks:** `npm run check` passed (**335/335** tests). New: notification rules 5, push API 11 (key exposure, endpoint allowlist, logout removal, device re-binding, 503 without keys, default/with-text/hidden previews, muted/off/on-screen/sender rules, 410 cleanup, temporary failures, friend requests). `web-push` builds a signed, encrypted request with our settings. E2E **41/41**, including the notification settings. The automated browser has no real push service, so it checks that an error is shown instead of a silent failure.

**Not verified yet (needs you):**

- A real notification on your computer (`npm run app:local`).
- iPhone and Android notifications (they need HTTPS, so after deployment in Phase 11).

### 2026-10-17 — Phase 9B: installable app (PWA)

**Completed**

- **Manifest and icons:** name, standalone display, Teakhelet theme. Icons are drawn as SVG and rendered to 192/512/maskable/Apple 180/favicon by `scripts/generate-icons.mjs` (no image library needed).
- **Service worker (Workbox injectManifest):**
  - Stores **only** the app's own files (22 files, ~900 KB).
  - `/api`, sockets and media always go to the network, so private data never lands in Cache Storage (tested).
  - Pages open from the stored app shell, also offline.
- **Updates:** a "new version — Reload" banner. The app never switches mid-conversation by itself, and installed apps check for updates every hour.
- **Settings → Install the app:** the browser's install dialog (Android/desktop); a Share → Add to Home Screen guide on iPhone/iPad (iOS 16.4+ for notifications); "installed" when it already is.
- **Found by my own checks and fixed:**
  - Opening the app offline showed "Loading…" forever. It now says "You're offline" and continues by itself when back.
  - Losing the connection inside the app showed nothing. A "Connecting…" / "You're offline — messages will send when you're back" pill now appears after 2.5 s.
  - When the phone goes offline the app now drops the connection at once (instead of after a ~45 s heartbeat timeout), then reconnects and catches up the moment the network returns.

**Checks:** `npm run check` passed (**319/319** tests); E2E **40/40**:

- manifest/icons;
- service worker controls the page;
- the app opens offline, then recovers;
- no `/api` or socket URLs in any cache;
- offline mid-chat shows the pill, a message typed offline is sent after reconnecting.

Unit tests cover the update banner and the install guide (iPhone / Android / already installed).

**Not verified yet:** installing on a real Android phone and iPhone needs HTTPS, so it is tested after deployment (Phase 11).

### 2026-10-17 — Phase 9A: online status and last seen

**Completed**

- **Server presence (in memory):** online = at least one connected device with the app on screen; "offline" is sent 8 s after the last one goes, and "last seen" is saved. Friends only, and reciprocal for online status and last seen, like WhatsApp.
- **Live updates:** a snapshot on connect, then updates. Privacy changes are applied immediately for friends and for me. Friendship changes trigger a refresh.
- **App:** "online" / "last seen today at 9:12 PM" in the chat header (refreshed every minute), green dots on the chat list and friends list. The app reports when it is hidden or shown.
- **Settings → Privacy:** switches for online status, last seen, read receipts, and "let people find me in search", each with a plain explanation.

**Checks:** `npm run check` passed (**315/315** tests). New socket tests (5) cover friends-only updates, the offline delay with a "last seen" time, background tabs not counting as online, privacy both ways, and malformed input. The socket test also caught a real bug: a quick reconnect sent friends a second "online". Fixed. E2E **37/37**, including two browsers: online → last seen → hidden after turning it off → reciprocity (repeated 3×).

### 2026-10-17 — Real Cloudinary verification

Run with your account; no secrets were printed:

- Upload → verify (true format and size) → signed view (200) → delete: all passed.
- Browser direct upload from a page on another origin: 200 with progress events (CORS works).
- A link **without our signature** → 401; a signed link **changed** (different size) → 401; the "public" form of the URL → 404.
- A fake photo and a fake video are rejected by Cloudinary itself. The app now shows "This file isn't a photo or video that can be sent" instead of Cloudinary's technical message.
- Setup notes: Cloudinary's new roles system gives fresh API keys no permissions. On the free plan only "Master Admin" works for an API key (documented in SETUP step 5). The key stays server-only.

### 2026-10-17 — Phone experience pass (after your feedback)

You reported the emoji picker covering the typing box and slow selection. I then audited the whole chat experience myself and added [UX_CHECKLIST.md](UX_CHECKLIST.md), which I now run at the end of every phase.

**Fixed**

- **Emoji panel like WhatsApp:** it opens below the typing box in place of the keyboard; the message stays visible with its cursor; emojis go in at the cursor; ⌫ deletes one whole emoji; recently used emojis come first; ⌨ / tapping the box / tapping outside / Back close it. GIFs moved into the same panel as a tab (one button fewer on small screens).
- **New layout:** 😊 and 📎 sit inside the typing pill, with Send beside it.
- **Found by the audit:**
  - Tapping Send closed and reopened the phone keyboard (it now stays open).
  - No way back to new messages after scrolling up (now a ↓ button with a count).
  - The newest message was hidden when the keyboard/panel/photo tray/"typing…" appeared (the list now stays pinned).
  - A blue tap flash on Android, and no pressed state on buttons.
- **Real-phone testing:** `npm run dev:phone` opens the dev app on a phone on the same Wi-Fi. In development only, the server also accepts private network addresses (192.168.x.x etc.); this is unit-tested and never applies to production.

**About slow selection:** your screenshot was taken in the computer's DevTools phone mode, where long-press is simulated and emojis often can't be selected. The typing box uses the phone's own native selection, so on a real phone it works at normal speed. It's on the checklist to confirm on your phone.

**Checks:** `npm run check` passed (**310/310** tests); E2E **36/36**, including a touch-phone test (the panel replaces the keyboard, the typing box stays above it, Back closes it, sending keeps it open, a tap on the messages closes it) and the ↓ new-messages button. Light/dark phone screenshots reviewed.

### 2026-10-17 — Phase 8B: media and GIFs (app screens)

**Completed**

- **Sending:** 📎 button (or paste an image) → picked files appear above the message box and upload straight away, with a progress ring, ✕ to remove and Retry after a failure. Up to 10 files. Type and size are checked before uploading. The text becomes an optional caption, and Send waits until the uploads finish. Files I send show instantly from the copy on my device.
- **In the chat:** one photo/video at its real shape; several in a 2-column grid with "+N". The space is reserved before loading, so nothing jumps. Videos show a poster, a ▶ and their length. Unsent media disappears.
- **Viewer:** full screen; swipe, arrows or ←/→ between items; videos play there; ✕, Escape, a tap outside or the phone's back button close it.
- **GIFs:** GIF button → KLIPY trending/search (“Search KLIPY”, “Powered by KLIPY”), strictest content filter; a tap sends it. Without a key: "GIFs aren't available".
- **Profile photo:** Settings → Add/Change/Remove photo; it appears for friends, in search and in chats.
- Chat list, pinned bar, reply quotes and the reply bar say "📷 Photo", "🎥 Video", "3 photos" or "GIF".
- **Your request:** the emoji picker now stays open while you add several emojis; a tap outside, ✕ or the **phone's back button/gesture** closes it. The back button now closes **every** popup (menus, options, viewer) instead of leaving the page.
- **Security fix:** Cloudinary's SDK puts the API key and secret inside its error objects. Errors are now reduced to message + status before they're thrown or logged (unit test added). This was found when a test printed one; see "Bugs".

**Checks executed (2026-10-17)**

| Check              | Result                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`    | **passed**: lint (+ cycles + hidden chars), format, **306/306** tests, build                                                                                                                                                                                                                                                                           |
| New client tests   | message summaries; file checks (HEIC without a type, PDF, empty, 10/100 MB); photos load through `/api/media/…` with the space reserved; video poster + length + "+N"; GIF; unsent media hidden; GIF picker loads KLIPY directly with attribution and sends the right data; emoji picker stays open and closes on back                                 |
| `npm run test:e2e` | **35/35**, incl. new: journey 7 (2 photos + caption → live for the other person → viewer, next, browser Back closes it → **a stranger gets 404** → unsend removes the photos and the file), **disguised file refused** with Retry/remove, GIF picker (KLIPY answered by the test), emoji picker + Back on a phone size, profile photo seen by a friend |
| Flakiness          | media + chat features + messaging E2E repeated 3× → 34/34                                                                                                                                                                                                                                                                                              |
| Real KLIPY         | your key works: search returns results, browser requests allowed (CORS `*`)                                                                                                                                                                                                                                                                            |
| Real Cloudinary    | **not yet**: your `CLOUDINARY_URL` uses "Root" (the API key's _name_) instead of your cloud name, so Cloudinary refuses it                                                                                                                                                                                                                             |
| Visual check       | phone screenshots of the upload tray, received photos + grid, GIF picker, viewer and chat list reviewed                                                                                                                                                                                                                                                |

**Bugs found and fixed**

- A Cloudinary test I ran printed the SDK's error, which included your API secret, into the session log. The code now strips credentials from those errors, and you were asked to create a new key. The KLIPY key was never printed.

**Not verified yet**

- A real upload → convert → view round trip through your Cloudinary account (after the .env line is fixed).
- iPhone HEIC photos and HEVC videos on real devices.

### 2026-10-17 — Phase 8A: media and GIFs (server)

**Provider research (2026-10-17)**

- Cloudinary free plan confirmed: no card; 25 credits per month; 10 MB per photo, 100 MB per video; Admin API 500 requests per hour (one per upload check).
- Signed delivery URLs of "authenticated" assets **don't expire** on the free plan, so SECURITY.md §8 item 2 is now confirmed and documented.
- GIFs: Google **shut down the Tenor API** on 30 June 2026. GIPHY's free key allows only 100 calls per hour. **KLIPY** was chosen (free, no card).
  - KLIPY's terms forbid server proxies, so GIF search runs from the browser. This is a documented change from the planned server proxy.

**Completed**

- **Storage adapter** with two implementations:
  - Cloudinary: signed direct uploads; `authenticated` assets; HEIC → `f_auto`; every video converted once after upload to H.264/AAC MP4 (eager), with the same transformation used for playback; signed delivery URLs.
  - Local folder (development/test only, refused in production): signed upload token, magic-byte check, signed 5-minute file links.
- **Uploads:** `POST /api/media/uploads` → direct upload → `complete`.
  - `complete` checks the real stored format (not the file name or the claimed type), size and dimensions; anything else is deleted (422).
  - Other checks: allowlist (415), size limits (413), member + friends, at most 30 unsent uploads, 120 uploads per hour.
  - Cancel deletes the file.
- **Messages** can now be text, photos/videos (up to 10, optional caption) or a KLIPY GIF (https `static.klipy.com` only).
  - Uploads are claimed inside the send transaction, so the same file can't be sent twice. Idempotent retries still return the original message.
  - Reply quotes say "Photo", "Video" or "GIF". Media messages can't be edited.
- **Viewing:** `GET /api/media/:id` checks access every time, then redirects (302, `no-store`) to a signed URL. Strangers, unsent, deleted-for-me and cleared messages all get 404.
- **Unsend** deletes the files from storage.
- **Cleanup job** (every 15 min): deletes uploads that were never sent after 24 h, and retries failed deletes.
- **Profile photos:** upload → `PUT /api/users/me/avatar`. Replacing or removing a photo deletes the old file. Users who blocked each other can't see each other's photo. Account deletion removes the photo and any unsent uploads.
- **CSP** now allows only the configured media host (`res.cloudinary.com`), the upload host (`api.cloudinary.com`) and KLIPY's hosts when a key is set.

**Checks executed (2026-10-17)**

| Check             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`   | **passed**: lint (+ cycles + hidden chars), format, **294/294** tests, build                                                                                                                                                                                                                                                                                                                                                                                                                            |
| New server suites | media 26/26 (real type detected; **disguised file rejected and deleted**; photo claimed as video rejected; 415/413; non-member/non-friend; forged token; cancel; 503 without storage; captions; **stranger and signed-out visitor get 404/401**; unsent upload invisible; own/ready/this-chat/once rules; idempotent retry; **unsend deletes files**; delete-for-me; no edit; reply quote; GIF host allowlist; KLIPY config; avatars incl. block and replacement; cleanup job); file-type detection 4/4 |

### 2026-10-17 — Phase 7: chat features

**Completed**

- **Message actions** (long-press on touch, right-click or ⋯ on desktop, Shift+F10 / keyboard):
  - quick reactions + emoji picker (one reaction per person, tap a chip to toggle);
  - reply with quote, which jumps to the original when tapped;
  - copy;
  - edit (own, 15 min, "edited" label, no history kept);
  - pin/unpin (max 10) with a pinned bar that walks through the pins;
  - delete for me;
  - unsend for everyone (own, 24 h, two-tap confirm; the text, reactions and pin are removed from the database and a "Message unsent" placeholder remains).
- **Chat options** (works on phones too; replaces the desktop-only details panel):
  - search in this chat (n of m, ↑/↓, Enter/Shift+Enter, highlighted words);
  - mute (8 h / 1 week / until unmuted; used by notifications in Phase 9);
  - personal chat color (6 presets, contrast-tested);
  - clear chat history for me only.
- **Long-press preview** on the chat list: shows the last 4 messages without marking them read (no receipt sent, unread count kept). Right-click / Shift+F10 do the same.
- **Global search** in the Chats search box: chat names plus whole-word message search across all my chats (Bangla works). Tapping a result opens the chat at that message.
- Emoji composer button with a curated, dependency-free emoji set.
- Server: Message gains reply/reactions/edit/unsent/hidden/pin/version fields and a text index; members get clear/mute/accent; live `message:updated`, `message:hidden`, `conversation:updated`; the code was split into access, serialization, conversation and message-action modules.

**Deferred (documented):** selecting several messages at once (multi-select) moves to Phase 10 polish. All single-message actions are available.

**Checks executed (2026-10-17)**

| Check              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`    | **passed**: lint (+ cycles + hidden chars), format, **264/264** tests, build                                                                                                                                                                                                                                                                                                                                                                     |
| New server suites  | message actions 15/15 (edit window & ownership, delete-for-me privacy, unsend really deletes text in the DB, 24 h limit, reply quotes incl. unsent originals and cross-chat refusal, emoji validation incl. 👩‍💻, friends-only reactions, 10-pin limit, clear chat, personal mute/color, preview has no side effects, search scoping/hidden/unsent/cleared/all-words/Bangla); socket: edit/reaction live to both, delete-for-me only to my devices |
| New client tests   | message search with highlighted results; preview fetches `messages?limit=4` only, no read request; Retry/Delete; contrast for 6 chat colors                                                                                                                                                                                                                                                                                                      |
| `npm run test:e2e` | **30/30**, incl. two browsers: react → reply (quote) → edit (live "edited") → pin (pinned bar) → in-chat search with highlight → unsend (placeholder for both); **preview keeps "Delivered" and unread, opening the chat turns it "Seen"**; delete-for-me and clear chat affect only me                                                                                                                                                          |
| Flakiness          | feature + messaging E2E repeated 3× → 19/19                                                                                                                                                                                                                                                                                                                                                                                                      |
| Visual check       | phone screenshots of the action sheet, reply bar and chat options reviewed. The selected chat color ring was too faint and was fixed.                                                                                                                                                                                                                                                                                                            |

**Bugs found and fixed in this phase**

- The precise emoji check never ran because of an escaping bug (`\p` became `p`); only the fallback was used. Caught by ESLint's regex check and fixed with `String.raw`; keycap emoji are now accepted.
- The hidden-character guard flagged legitimate joiners (U+200D in 👩‍💻, U+200C used by Bangla). It now allows them and still blocks the dangerous characters.
- Mongoose silently ignored edits to `createdAt`, which made the time-window tests meaningless at first. The tests now age messages through the raw driver.
- Two render-purity issues (clock read during render) were fixed by moving "muted" to the server and computing the mute end time in a handler.

**Not verified**

- Long-press feel and the iOS text-selection callout on a real iPhone (emulated in Edge only).
- Mute has no visible effect until notifications arrive (Phase 9).

**Next action:** your review — try reactions, reply, edit, unsend, pin, search and the long-press preview between your two accounts. Then Phase 8: photos, videos and GIFs.

---

### 2026-10-16 — Phase 6: real one-to-one messaging

**Completed**

- Models: Conversation (one per pair via a unique `directKey`, atomic `lastSeq` counter), ConversationMember (membership is the only access proof; delivered/read watermarks), Message (unique `(conversationId, seq)` and `(senderId, clientMessageId)`).
- Sending:
  - Transaction assigns gap-free sequence numbers, even with many concurrent senders.
  - Idempotent by `clientMessageId`: a retry or a race returns the original message.
  - Works over Socket.IO acknowledgements or the REST fallback.
  - Friends only; unfriended or blocked → `NOT_FRIENDS`, and history stays readable.
- Receipts:
  - **delivered** = the recipient's app acknowledged it, from any screen;
  - **seen** = the chat was open, the page visible and focused, and the reader at the newest messages;
  - replying also marks earlier messages as read;
  - reciprocal privacy: `readUpToSeq` is hidden if either person turned read receipts off;
  - stale or repeated receipts are ignored (forward-only, clamped).
- Unread counts (bounded at 99+), read sync across my devices, typing indicator (throttled, expires, cleared on disconnect).
- Client:
  - Real conversation list and chat screen; the sample data was removed.
  - History pages of 30, with older messages loaded on scroll while keeping your position.
  - The unread divider is fixed at the point where unread messages began.
  - "Message" buttons on friends; Chats tab badge.
  - "You can't send messages" notice when not friends; deleted accounts shown as "Deleted account".
- **Outbox:**
  - Unsent messages are kept on the device (IndexedDB, cleared on logout).
  - Retried with the same id after a timeout (max 3).
  - Sent automatically when back online.
  - "Not sent — Retry / Delete" for permanent errors.
- Reconnect: the newest page of open chats and all lists are reloaded from REST, so nothing missed while offline is lost.

**Checks executed (2026-10-16)**

| Check              | Result                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`    | **passed**: lint (+ cycles + hidden chars), format, **240/240** tests, build                                                                                                                                                                                                                                                                                    |
| New server suites  | messages 14/14 (IDOR 404s, forged sender, idempotency incl. races, 10 concurrent sends → seqs 1–10, paging, unread, clamping, receipt privacy, unfriend/block, deleted account); socket messaging 6/6 (acks, multi-device fan-out, duplicate retry, forged/foreign/spam refused, delivered → seen, read-sync, stale receipts, typing + auto-stop on disconnect) |
| New client tests   | outbox 5/5 (same id on retry, permanent failure + manual retry, offline queue, REST fallback); tick logic; failed-message actions                                                                                                                                                                                                                               |
| `npm run test:e2e` | **27/27**, incl. two browsers: Message button → send → delivered while on another screen → Chats badge → open → **Seen** → typing → reply → refresh keeps history; offline send then auto-send (stored once); unfriend replaces the composer live                                                                                                               |
| Flakiness          | messaging + friends E2E repeated 3× → 16/16                                                                                                                                                                                                                                                                                                                     |

**Bugs found and fixed in this phase**

- A reply silently marked earlier messages read without telling the sender. It now sends the receipt and syncs my other devices.
- React purity violations (refs and the clock read during render) flagged by the React rules: fixed with render-safe patterns.
- A scroll effect depended on a rebuilt object (it would have yanked readers to the bottom on every render).
- On desktop, switching chats could have carried scroll and unread-divider state over: each chat now remounts.

**Not verified**

- Real phones on flaky mobile networks (reconnect/outbox behavior is tested with browser offline emulation only).
- Very long histories (thousands of messages): paging is implemented, but list virtualization isn't (Phase 10 measures whether it's needed).

**Next action:** your review — chat between your two accounts (normal + private window). Then Phase 7: edit, unsend, reactions, replies, pins, long-press preview, search.

---

### 2026-10-16 — Phase 5: friends, privacy and the first real-time connection

**Completed**

- Models: Friendship (one document per pair; a unique `pairKey` makes duplicate or crossed requests impossible), Block, Report, Notification (90-day TTL).
- Friend requests:
  - send, accept, decline, cancel, remove friend;
  - a 7-day cooldown after a decline;
  - "they already asked you" detection;
  - simultaneous crossed requests leave exactly one.
- Blocking:
  - removes the friendship/request and hides both people from each other's search and profile;
  - the blocked person sees exactly what a missing account looks like;
  - unblocking doesn't restore the friendship.
- Search: exact + prefix username search on the index; hides me, unverified accounts, blocked users and non-discoverable users (unless the username is exact).
- Profiles, abuse reports (stored for review), in-app notification feed (friend request / accepted).
- **Socket.IO server:**
  - same HttpOnly cookie auth;
  - origin check against cross-site WebSocket hijacking;
  - verified users only;
  - server-controlled `user:`/`session:` rooms;
  - session re-check every 5 minutes;
  - logout/revoke/password change/account deletion close that session's sockets.
- Live updates: friend requests, accepts, removals and blocks update every open device instantly. The client refetches from REST after each event and after reconnecting.
- Client:
  - Friends page: debounced search, requests, activity, friends, sent requests, blocked list.
  - Profile dialog: two-tap remove/block, report form.
  - Native `<dialog>` primitive (bottom sheet on phones); unread badge on the Friends tab.
- Account deletion now also removes friendships, blocks and notifications, and updates friends' screens.

**Checks executed (2026-10-16)**

| Check                  | Result                                                                                                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`        | **passed**: lint (+ cycles + hidden chars), format, **210/210** tests, build                                                                                                                                                                                         |
| New server suites      | friends 17/17 (search privacy, state machine, authorization, race, blocks, reports, notifications); sockets 9/9 (no cookie, foreign origin, unverified, multi-device delivery, block not revealed, logout disconnects only that device, password change disconnects) |
| `npm run test:e2e`     | **24/24**, incl. two people in separate browsers: search → request → live arrival → accept → live friend list → block → hidden; report flow                                                                                                                          |
| Flakiness check        | friends + auth E2E repeated 3× → 25/25                                                                                                                                                                                                                               |
| `npm audit --omit=dev` | 0 vulnerabilities                                                                                                                                                                                                                                                    |

**Bugs found and fixed in this phase**

- "Send the link again" crashed (`req.body` is undefined for empty requests in Express 5). Fixed; test added.
- Logging out from Settings returned to Settings after the next login. A deliberate logout now goes to plain `/login`.
- That fix briefly regressed when logout started closing the live connection (the client mistook its own logout for a remote sign-out). The client now ignores the disconnect it caused itself; caught by E2E.
- E2E usernames collided on repeated runs; tests now use unique names (also needed for CI retries).

**Not verified**

- Live updates on real phones and flaky mobile networks (reconnect behavior is implemented; real-device testing is planned for deployment).

**Next action:** your review — open Friends, search for a second account (register one in another browser or a private window), and try requests, accept, block. Then Phase 6: real one-to-one messaging.

---

### 2026-10-16 — Phase 4: authentication and profiles

**Completed**

- Shared Zod schemas (`shared/src/schemas`): email, username (3–20, a–z 0–9 . _, reserved names), display name/bio (control and bidi characters stripped), passwords (10–128, common-password list, must not contain username/email). The client and server use the same rules.
- Models: User (settings embedded, partial unique indexes so deleted accounts free their email/username), Session (hashed token, CSRF token, idle 30 d / absolute 180 d, TTL), AuthToken (hashed one-time links, TTL), AuditEvent (180-day TTL).
- Security:
  - Argon2id passwords (OWASP parameters); identical login errors and timing for unknown users.
  - Session cookie: `HttpOnly; SameSite=Lax`, plus `__Host-` and `Secure` on HTTPS.
  - Origin check on every state change, plus a per-session CSRF token.
  - Rate limits: login per account and per IP, registration, email requests, sensitive actions.
  - `Cache-Control: no-store` on all private API responses.
  - Unique indexes are built before the server accepts traffic.
- Features: register (enumeration-safe 202), email verification, login with email or username, logout, persistent sessions, forgot/reset password (signs out everywhere), change password (signs out other devices + rotates the session), change email (confirm via the new address + notice to the old), active-sessions list with per-device and "all others" sign-out, profile, username (7-day cooldown), settings (theme saved to the account), account deletion (password + "DELETE"; anonymous tombstone).
- Client: login/register/forgot/reset/verify/confirm pages, verify-email notice, route guards (with a safe `?next=` return), Settings sections, `useForm` with field-level server errors and focus on the first error, email-link tokens removed from the address bar, global sign-out when the server reports the session is gone.
- Email: `console` transport in development (links printed in the server terminal), `memory` in tests, `smtp` required in production.
- New guard: `scripts/check-hidden-chars.js` (part of `npm run lint`) fails on invisible bidi/zero-width characters in source.

**Checks executed (2026-10-16)**

| Check                                                    | Result                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                          | **passed**: lint (+ cycles + hidden chars), format, **181/181** unit/integration tests, build                                                                                                                                                    |
| Server auth integration suite (real MongoDB replica set) | 41/41 in total for the server; stable across 3 consecutive runs                                                                                                                                                                                  |
| `npm run test:e2e` (Edge, production build, strict CSP)  | **22/22 passed**: register → verify link → login → refresh; unverified notice; return to `?next` after login; wrong-password message; forgot/reset; profile edit; logout loses access; signing out another device; plus all Phase 3 layout tests |
| Manual (browser pane, your dev server)                   | signed-out redirect to `/login?next=…`; register form validation and focus at 390 px; no overflow                                                                                                                                                |

**Bugs found and fixed in this phase**

- Mongoose's global `sanitizeFilter` stripped the server's own `$gt`/`$ne` queries (every email link failed with 500). Removed. Injection protection stays at the strict Zod boundary, which has a test.
- Unique indexes are built in the background, so a username change could duplicate a username right after start-up. The server now waits for indexes, and a concurrent-sign-up test was added.
- Login ignored `?next=` and logout raced with the route guard. The guards now own all post-login/logout redirects.
- File writes decoded `\u202E`-style escapes into invisible characters in 3 files. Fixed, and the new lint check prevents a repeat.
- Test databases leaked about 2 GB into `C:…Temp` (your C: drive had 0.07 GB free). Removed the leftovers; E2E now uses one wiped folder on G:, and test DBs skip the 200 MB log preallocation.
- Replaced the deprecated Mongoose `new: true` option.

**Needs your attention**

- **Your C: drive has about 2 GB free.** Windows and other apps may misbehave when it fills up. Consider freeing space (Disk Cleanup, emptying Downloads/Recycle Bin).
- Real email isn't configured yet. Verification links appear in the server terminal (look for "DEV EMAIL"). Set up Brevo or a Gmail app password (SETUP.md step 4) before deployment.

**Not verified**

- Real email delivery (no SMTP configured).
- Password managers' autofill behavior on iOS/Android (needs real devices).

**Next action:** your review. Try it with `npm run dev`: register, copy the verification link from the server terminal, log in, explore Settings. Then Phase 5: friends, search and blocking.

---

### 2026-10-16 — Phase 3: design system and UI foundation

**Completed**

- Design tokens (`client/src/styles/tokens.css`): Teakhelet purple scale, purple-tinted neutrals, light + dark semantic colors, radii, shadows, motion (zeroed under reduced motion), layout sizes. Exposed to Tailwind as `bg-surface`, `text-muted`, etc. No hex codes in components except the avatar initials palette.
- Self-hosted Inter Variable font (no Google Fonts request). Falls back to system Bangla fonts (Nirmala UI / Noto Sans Bengali), which Inter doesn't cover.
- Theme: System / Light / Dark, saved on this device. Synced to the account in Phase 4. `public/theme-init.js` applies the theme before the first paint (CSP-safe, so no flash), and the theme-color meta tag updates.
- UI primitives: Button, IconButton, Avatar (initials + online dot), Badge (99+), Spinner, Skeleton, EmptyState, SearchField.
- App shell: phones get a bottom navigation, hidden inside an open chat; desktop ≥ 1024 px gets a navigation rail + list + chat; ≥ 1280 px adds a contact-details panel. Uses safe-area insets, `interactive-widget=resizes-content`, and a visualViewport hook that keeps the composer above the iOS keyboard.
- Chat UI: conversation list (pinned first, local name filter, unread/muted/pinned/typing states), chat header with presence text, message list with day dividers, unread divider, sender grouping, scroll that never yanks a reader away, bubbles with sending/sent/delivered/seen/failed states (labelled for screen readers, not color-only), typing indicator, composer (autosize; Enter sends on desktop, newline on touch; never sends mid-IME composition for Bangla keyboards).
- Settings page with a working theme selector. The Friends page shows an honest "Phase 5" empty state.
- **Sample data is clearly labelled.** The chat screens use `features/chat/designPreview/` with a visible "Design preview — nothing is sent" banner. That folder is deleted in Phase 6.
- Routes: `/` → `/chats`; `/chats/:id`, `/friends`, `/settings`; the dev status check moved to `/status`.

**Checks executed (2026-10-16)**

| Check                                                   | Result                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run`                                        | **108/108 passed** (14 files): includes Composer keyboard/IME, bubbles never render HTML, status labels, list ordering/filter, theme persistence, grouping, date formatting, and WCAG contrast for 20 text pairs + 75% timestamp + non-text indicators in both themes |
| `npm run test:e2e` (Edge, production build, strict CSP) | **15/15 passed**: 360/390/768/1440 px × light/dark with no horizontal overflow and no console/CSP errors; phone list→chat→back; composer inside viewport; desktop side-by-side + details panel; theme survives reload with no flash                                   |
| `npm run check`                                         | passed (lint, cycles, format, tests, build)                                                                                                                                                                                                                           |
| Manual check in the browser pane                        | desktop dark/light, 390 and 360 px phone, 768 px tablet; seen-tick color, font, overflow verified via computed styles                                                                                                                                                 |

**Bugs found and fixed in this phase**

- Message grouping crashed on the last message (read `senderId` of a missing next message). Caught by unit tests.
- After the first open, new messages re-scrolled to the unread divider. Now: unread divider on first open only; later, follow only your own messages or when already at the bottom.
- Light mode: grey incoming bubbles blended into the grey chat background → white bubbles on lavender.
- `--text-subtle` failed WCAG AA (3.7–4.3:1) in both themes → new greys (≥ 4.8:1). Caught by the contrast test.

**Not verified (needs real devices)**

- iOS Safari / installed PWA: keyboard + composer behavior, safe areas, momentum scrolling. Edge's mobile emulation is **not** iOS WebKit.
- Android Chrome on a real phone (keyboard resize with `interactive-widget`).
- Screen-reader pass (NVDA/VoiceOver): planned for Phase 10.

**Next action:** your review of the design (run `npm run dev`, open http://localhost:5173 on your PC, and on your phone if it's on the same Wi-Fi). Then Phase 4: authentication and profiles.

---

## Phase 2 — development environment (complete)

### 2026-10-16 — Phase 2: development environment

**Completed**

- Plan approved with a zero-cost constraint. Decisions recorded in REQUIREMENTS.md §4.
- Installed Node.js 24.20.0 LTS via `winget` (was 22.17.1). npm 11.6.2.
- `git init` (branch `main`). `.gitignore` was created before any secret existed. **No commits yet.**
- npm workspaces: `shared`, `server`, `client`, with exact pinned versions (`.npmrc save-exact`, `engine-strict`).
- Server: env validation (Zod), pino logger with redaction, Mongo connection (`strictQuery`, `sanitizeFilter`), helmet security headers + strict CSP, JSON body limit 32 KB, standard error envelope with request ids, `/api/health` + `/api/health/ready`, single-origin client hosting with correct caching, graceful shutdown.
- Client: Vite 8 + React 19 + React Router 8 + TanStack Query + Tailwind 4; dev proxy for `/api` and `/socket.io`; `apiRequest` helper; a temporary development status page (it will be replaced in Phase 3).
- Tooling: ESLint 10 flat config (React hooks rules + a ban on `dangerouslySetInnerHTML`), circular-import check (madge), Prettier, Vitest projects, Playwright + E2E test server (in-memory MongoDB replica set).

**Checks executed (2026-10-16)**

| Check                                       | Result                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run`                            | **26/26 passed** (shared 2, server 16 incl. real MongoDB replica set, client 8)                                                               |
| `npx eslint .`                              | passed, 0 problems                                                                                                                            |
| Lint rule sanity check                      | confirmed it **fails** on conditional hooks and `dangerouslySetInnerHTML`                                                                     |
| `npm run lint:cycles`                       | no circular dependencies                                                                                                                      |
| `npx prettier --check .`                    | passed after `prettier --write`                                                                                                               |
| `npm run build`                             | passed — JS 347.5 kB (108.9 kB gzip), CSS 6.9 kB                                                                                              |
| Real server boot (`e2e/startTestServer.js`) | `/api/health/ready` → database up; SPA route served with CSP + `no-cache`; unknown API route → JSON 404; log line contains no headers/cookies |
| `npm run test:e2e` (Microsoft Edge 155)     | **2/2 passed**: production build loads, CSP present, API + DB reachable, no console errors; unknown route → not-found page → link home        |
| `npm run check` (full phase gate)           | **passed** (exit 0)                                                                                                                           |
| Leftover processes after tests              | none (no orphaned `node`/`mongod`)                                                                                                            |

**Issues found and fixed during this phase**

- The `mongodb-memory-server` postinstall downloads an 819 MB MongoDB binary. PowerShell showed the partial download as 0 bytes, so I wrongly thought it had stalled and deleted the partial file. The root install re-downloaded it successfully. It's now cached in `node_modules/.cache/mongodb-memory-server`.
- Playwright's own Chromium download (197.5 MiB) stalled at 0% twice, even though a manual check measured the CDN at ~240 KB/s. E2E now uses the **Microsoft Edge already installed** in Windows (`channel: 'msedge'`), so no browser download is needed.

**Verified by you (2026-10-16)**

- `npm run dev` against your MongoDB Atlas dev cluster: the status page showed **API: ok** and **Database: up** (screenshot shared).

**Not yet verified**

- Graceful shutdown on SIGINT/SIGTERM (Windows signal handling differs; it will be checked when running `npm run dev` and pressing Ctrl+C).

**Phase 2 result:** ✅ complete.

---

### 2026-10-15 — Phase 0 and Phase 1 planning (approved 2026-10-16)

- Inspected the empty project folder and the installed tools. Checked current package versions on npm.
- Wrote README and docs: REQUIREMENTS, ARCHITECTURE, DATABASE, API, SECURITY, TESTING, ROADMAP, SETUP.
- Tests executed: none (documents only).
- Still assumptions: provider free-tier numbers must be re-checked at sign-up; Cloudinary free-plan link expiry is confirmed in Phase 8; GIF provider is chosen in Phase 8.
