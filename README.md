# Adda

**Adda** is a private, real-time, one-to-one messenger for friends. Messages are **end-to-end encrypted**: only the two people in a chat can read them. Not the server, and not the developer.

It runs in any modern browser and installs like a native app on **Android, iPhone/iPad (iOS 16.4+), Windows, macOS and Linux**. You get a home-screen icon, a full-screen window, push notifications and in-app updates, with no app store needed.

> **Status:** actively developed. Messaging, friends, media, notifications, presence, the installable app and end-to-end encrypted messages are complete. End-to-end encryption for photos and videos is in progress. Progress is logged in [docs/STATUS.md](docs/STATUS.md).

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [How it works](#how-it-works)
- [Security](#security)
- [Database](#database)
- [User experience](#user-experience)
- [Quality and testing](#quality-and-testing)
- [Documentation](#documentation)
- [License](#license)

---

## Features

### Accounts

- Sign up with email, username and display name. Email verification is required before chatting.
- Log in with email **or** username. "Forgot password" sends an expiring, one-time reset link.
- Change your name, username (once every 7 days), bio, profile photo, email (confirmed by a link) and password.
- **Where you're signed in:** see every device with your account and sign any of them out, or all others at once.
- Delete your account. Your profile is removed, and messages you already sent show as "Deleted account".

### Friends

- Organised like Messenger's People tab: **Active** (friends online now), **Requests** (incoming and sent) and **Friends** (everyone, plus blocked people).
- One search box finds your friends by name and anyone by username. You can choose not to appear in search, so people can only find you by your exact username.
- Friend requests: send, accept, decline and cancel, all live in real time.
- Only friends can message each other, so no spam from strangers.
- Unfriend, **block** (instantly hides both people from each other) and **report**.

### Messaging

- Real-time one-to-one chat over WebSockets, with messages kept in order.
- **Ticks:** sent → delivered (reached a device of your friend) → seen.
- Typing indicator, **online status** and **last seen**.
- **Reactions** with any emoji, **reply** to a specific message, **edit**, **unsend** for everyone, **delete for me**.
- **Pin** important messages; search messages inside a chat (on the device).
- Emoji keyboard with recently used emojis, and a **GIF** picker (powered by KLIPY).
- **Photos and videos:** several at once with a caption, a full-screen viewer and swiping between items. iPhone HEIC photos and HEVC videos are supported, up to 100 MB per video.
- **Offline-safe sending:** messages written without internet wait in an outbox and send automatically when you're back online, never twice.
- Unread counts and badges, a "jump to newest" button with a count of new messages, and per-chat **mute** and **chat colour**.
- **Long-press a chat** to peek at the latest messages and photos without marking them as seen, or to **delete the whole chat** from your list.
- **Clear chat** and **delete chat**. Both affect only your own view; your friend keeps theirs.

### Notifications and app

- A **Notifications** tab collects everything in one place: friend requests, accepted requests, and **security alerts** — a sign-in on another device, or a change to your password, email, username or encryption keys — so you notice anything you didn't do.

- **Push notifications** when the app is closed, even on iPhone once installed.
- Choose what the lock screen shows: name and message, name only, or nothing.
- No notification while you're already looking at that chat, and none for muted chats.
- **Install Adda** in one tap from Settings.
- **In-app updates:** when a new version is released, open apps show "A new version of Adda is ready" with an **Update** button, plus a "What's new" summary.
- Works offline for the app shell; reconnects and catches up automatically.

### Privacy settings

| Setting               | Options                                                    |
| --------------------- | ---------------------------------------------------------- |
| Online status         | Shown to friends / hidden. Hiding yours also hides theirs. |
| Last seen             | Shown to friends / hidden. Works both ways, like WhatsApp. |
| Read receipts         | On / off. Works both ways.                                 |
| Appear in search      | On / off. Off means people need your exact username.       |
| Notification previews | Name and message / name only / nothing                     |
| Block and report      | Per person                                                 |
| Sessions              | List and sign out any device                               |

---

## Tech stack

Adda is a **MERN** application (MongoDB, Express, React, Node.js) with **Socket.IO** for real time. It is written in modern JavaScript as three packages in one repository:

| Package   | Role                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| `client/` | The web app / installable PWA (React)                                         |
| `server/` | REST API + real-time server (Express + Socket.IO)                             |
| `shared/` | Validation schemas, limits and event names used by **both** client and server |

### Frontend

| Technology                         | Used for                                                         |
| ---------------------------------- | ---------------------------------------------------------------- |
| **React 19**                       | User interface                                                   |
| **Vite 8**                         | Development server and optimized production build                |
| **React Router 8**                 | Screens and navigation (including the phone back gesture)        |
| **TanStack Query 5**               | Server data, caching, pagination and live cache updates          |
| **Tailwind CSS 4**                 | Design system with light/dark themes built on CSS variables      |
| **Socket.IO client 4.8**           | Real-time connection with automatic reconnection                 |
| **Web Crypto API** + **hash-wasm** | End-to-end encryption (ECDH, HKDF, AES-GCM) and Argon2id         |
| **vite-plugin-pwa / Workbox**      | Installable app, service worker, offline app shell, updates      |
| **Web Push API**                   | Notifications through the service worker                         |
| **Lucide** icons, **Inter** font   | Icons and typography (self-hosted, no third-party font requests) |

### Backend

| Technology                   | Used for                                                                  |
| ---------------------------- | ------------------------------------------------------------------------- |
| **Node.js 24 LTS**           | Runtime                                                                   |
| **Express 5**                | REST API                                                                  |
| **Socket.IO 4.8**            | Real-time events: messages, receipts, typing, presence, friend activity   |
| **MongoDB** + **Mongoose 9** | Database, with transactions for multi-step writes                         |
| **Zod 4**                    | One set of strict schemas validating every request, socket event and form |
| **Argon2id** (`argon2`)      | Password hashing                                                          |
| **Helmet**                   | Security headers and Content Security Policy                              |
| **express-rate-limit**       | Abuse and brute-force protection                                          |
| **web-push**                 | Encrypted push notifications (VAPID)                                      |
| **Nodemailer**               | Verification, reset and security emails                                   |
| **Pino**                     | Structured logs with sensitive fields redacted                            |

### Services (all on free tiers)

| Service           | Used for                                        |
| ----------------- | ----------------------------------------------- |
| **Vercel**        | Hosting the web app                             |
| **Render**        | Hosting the API and real-time server            |
| **MongoDB Atlas** | Managed database                                |
| **Cloudinary**    | Private media storage (photos, videos, avatars) |
| **KLIPY**         | GIF search                                      |

### Quality tools

**Vitest**, **Testing Library**, **Supertest**, **mongodb-memory-server**, **Playwright**, **ESLint**, **Prettier** and **madge** (circular-import check).

---

## How it works

```
 Phone / desktop (PWA)                         Server (Render)                    Services
 ┌──────────────────────────┐   HTTPS (REST)   ┌──────────────────────────┐
 │ React app                │ ───────────────▶ │ Express API              │ ───▶ MongoDB Atlas
 │  • encrypts / decrypts   │                  │  • auth, friends, chats  │
 │    messages on device    │   WSS (Socket.IO)│  • authorization checks  │ ───▶ Cloudinary (media)
 │  • outbox for offline    │ ◀──────────────▶ │ Socket.IO                │
 │ Service worker           │                  │  • live events, presence │ ───▶ Push services
 │  • push, offline, update │ ◀─── Web Push ── │  • push notifications    │      (Google, Apple, Mozilla…)
 └──────────────────────────┘                  └──────────────────────────┘
```

1. **Signing in** creates a session. The browser keeps it in a secure, HttpOnly cookie that page scripts can't read. The real-time connection uses a short-lived, single-use ticket tied to that session.
2. **Sending a message:** the device encrypts the text with a key only the two friends can compute, saves it to a local outbox, and sends it over the socket with a unique id. The server checks that the sender is a member of the chat, stores the **encrypted** message with the next sequence number, and pushes it live to both people's devices. It also sends a push notification if the friend isn't looking at the app.
3. **Receiving:** the friend's device decrypts the message and reports "delivered". When the chat is opened on screen it reports "seen", and the sender's ticks update instantly.
4. **Reconnecting:** after a network drop, the app catches up on exactly what it missed, using per-chat sequence numbers. The outbox then re-sends anything pending, and the unique id makes sure nothing is sent twice.
5. **Media** is uploaded straight from the device to private cloud storage with a one-time signed permission. The server verifies the file's real format before it can be sent, and only chat members can open it.
6. **Updates:** every deploy gets a build id. Open apps detect the new version, show an Update button, and switch to it without losing anything.

---

## Security

Security was designed in from the start: threat model first, then code, then tests.

### End-to-end encryption

- Each user's device creates an **ECDH P-256** identity key pair. The private key is stored on the device as a **non-extractable** key, so even the app's own scripts can't export it.
- Two friends derive the same chat key on their own devices (ECDH + **HKDF-SHA-256**). The key never travels over the network.
- Each message is encrypted with **AES-256-GCM** and a fresh random IV. The chat, sender and message ids are bound into the encryption, so a message can't be moved, swapped or replayed into another chat without being detected.
- **What gets encrypted:** text, captions, edits, reply quotes and the chosen GIF. The server stores and forwards only encrypted envelopes and **can't read them**.
- **New devices:** your keys are backed up **encrypted with your recovery password** (at least 6 characters with uppercase, lowercase, a number and a symbol) using **Argon2id** (64 MiB memory, 3 passes), which makes every guess slow and expensive. The server only holds this locked backup.
- Changing or resetting encryption keys requires your account password, is recorded in the security log, and triggers an email alert.
- Only standard, well-reviewed cryptography is used: the browser's built-in Web Crypto plus an established Argon2 implementation. No home-made algorithms.
- **Honest limits** are documented: the server still sees metadata such as who chats with whom and when (as in every messenger), there's no forward secrecy yet, and photo/video encryption is in progress. See [docs/E2EE.md](docs/E2EE.md).

### Accounts and sessions

- Passwords are hashed with **Argon2id**, the algorithm OWASP recommends. They are never stored, logged or shown anywhere.
- Common-password denylist and minimum length.
- Login rate limits per IP and per account, plus generic error messages, so attackers can't tell whether an account exists.
- Sessions use random tokens in `HttpOnly`, `Secure`, `SameSite` cookies; only a **hash** of the token is in the database. They expire after 30 days idle (180 days maximum) and rotate on login and password change.
- Changing your email or password, or deleting your account, needs your current password. A password change signs out every other device and disconnects its live connections immediately.
- Verification and reset links are random, single-use and short-lived. Security-relevant actions are written to an audit log.

### Protection against common attacks

| Attack                              | Protection                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Eavesdropping / man-in-the-middle   | HTTPS and WSS only, HSTS; message content is end-to-end encrypted on top of that                                    |
| SQL / NoSQL injection               | Every input parsed by strict Zod schemas into plain values; unknown fields rejected; no raw input in queries        |
| Cross-site scripting (XSS)          | React escaping, no raw HTML rendering, strict Content Security Policy (`script-src 'self'`)                         |
| Cross-site request forgery (CSRF)   | SameSite cookies + per-session CSRF token header + strict Origin check                                              |
| Cross-site WebSocket hijacking      | Origin allowlist and single-use connection tickets                                                                  |
| Reading other people's chats (IDOR) | Every request and socket event checks chat membership on the server; the sender id is never trusted from the client |
| Brute force and spam                | Rate limits on login, sign-up, messages, uploads and friend requests; friends-only messaging; block and report      |
| Malicious uploads                   | Signed uploads with type and size limits; real file format verified from the file's bytes; no SVG                   |
| Media link guessing                 | Private, authenticated storage; links issued only after an access check                                             |
| Clickjacking                        | `frame-ancestors 'none'`                                                                                            |
| Push notification abuse             | Subscriptions bound to the session; only known push services accepted; payloads encrypted                           |
| Leaked secrets                      | Secrets only in server environment variables, never in the repository; configuration validated at startup           |
| Sensitive data in logs              | Passwords, cookies, tokens, keys and message content are redacted                                                   |

Full threat model, session policy and security checklist: [docs/SECURITY.md](docs/SECURITY.md).

---

## Database

MongoDB with **15 collections**, strict schemas and indexes chosen for each query the app makes:

| Collection                           | Holds                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `User`                               | Profile, username, settings (theme, privacy, notifications)                                        |
| `Session`, `AuthToken`               | Hashed session tokens; one-time email tokens                                                       |
| `Friendship`, `Block`                | Friend requests and friendships; blocks                                                            |
| `Conversation`, `ConversationMember` | One-to-one chats; each person's own state (unread, delivered/seen position, mute, colour, cleared) |
| `Message`                            | Encrypted envelopes, sequence number, reactions, pins, edits, unsend                               |
| `Attachment`                         | Uploaded media and its lifecycle (pending → ready → attached → deleted)                            |
| `IdentityKey`, `KeyBackup`           | Public encryption keys; password-locked key backups                                                |
| `PushSubscription`, `Notification`   | Devices that receive push; the in-app notification feed                                            |
| `Report`, `AuditEvent`               | Abuse reports; security log                                                                        |

- **Per-chat sequence numbers** keep messages in perfect order and make reconnect catch-up exact.
- **Transactions** for multi-step writes (sending a message, accepting a friend request, deleting an account), so data is never left half-written.
- **Unique client message ids** prevent duplicate messages on retries.
- Expired sessions, tokens and abandoned uploads are cleaned up automatically.

Details and the ER diagram: [docs/DATABASE.md](docs/DATABASE.md).

---

## User experience

Adda is built to feel like WhatsApp or Messenger on a phone:

- Phone-first layout that adapts to tablets and desktops (a two-pane view on large screens).
- The composer stays above the on-screen keyboard; long-press menus, swipe-friendly viewers and large touch targets.
- The phone's back gesture closes pickers and menus before leaving a screen.
- Messenger-style Settings, grouped into Preferences, Account and About, with each item on its own page.
- Instant feedback: switches and actions update immediately and roll back with a message if saving fails.
- Light, dark and system themes with no flash on start; colours checked for readable contrast (WCAG AA).
- Clear empty states. New users see "Welcome to Adda" with a button to find friends.
- Friendly offline handling: an "offline" banner, a queued outbox and automatic catch-up.
- Accessible: labelled controls, keyboard support, visible focus and screen-reader announcements.
- Every phase is checked against a phone UX checklist ([docs/UX_CHECKLIST.md](docs/UX_CHECKLIST.md)).

---

## Quality and testing

- **360+ unit and integration tests** (Vitest, Testing Library, Supertest), running against a real temporary MongoDB.
- **End-to-end browser tests** (Playwright) that drive **two real users at once**: sign-up, friends, live messaging and receipts, reactions/replies/edits, media, GIFs, presence, privacy, notifications, settings, offline sending and in-app updates.
- Encryption tests check that a third person can't decrypt, that tampering is detected, and that private keys can't be exported.
- Every change must pass lint, formatting, a circular-import check, a hidden-character (Trojan Source) check, all tests and a production build.

---

## Documentation

| Document                             | Contents                                              |
| ------------------------------------ | ----------------------------------------------------- |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Stack, diagrams, real-time design, PWA and deployment |
| [E2EE](docs/E2EE.md)                 | End-to-end encryption design and its limits           |
| [SECURITY](docs/SECURITY.md)         | Threat model, session policy, security checklist      |
| [DATABASE](docs/DATABASE.md)         | Collections, indexes, ER diagram, retention           |
| [API](docs/API.md)                   | REST endpoints and real-time event contract           |
| [REQUIREMENTS](docs/REQUIREMENTS.md) | Scope, decisions and acceptance criteria              |
| [TESTING](docs/TESTING.md)           | Test strategy                                         |
| [ROADMAP](docs/ROADMAP.md)           | Phases and work breakdown                             |
| [STATUS](docs/STATUS.md)             | Progress log                                          |
| [UX_CHECKLIST](docs/UX_CHECKLIST.md) | Phone experience checks                               |

---

## License

Copyright (c) 2026 Jubayer Hasan. All rights reserved.

This is proprietary software. Copying, modifying, redistributing or deploying any part of it without written permission is not allowed. See [LICENSE](LICENSE).
