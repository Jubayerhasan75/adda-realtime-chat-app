# Security and Privacy Assessment (Phase 1)

Status: **Draft for approval** (2026-10-15). These are the planned controls. None of them are implemented or verified yet.

## 1. Assets to protect

1. Message content and media.
2. Who talks to whom: friend lists, conversation metadata, presence.
3. Account credentials and sessions.
4. Email addresses and other private profile data.
5. Availability of messaging (abuse and spam resistance).

## 2. Trust boundaries

```
[Browser / PWA]  --(untrusted input: HTTP, WebSocket, uploaded files)-->  [Node service]  --> [MongoDB Atlas]
                                                                              |---> [Media storage]  (signed requests)
                                                                              |---> [Email / Push / GIF providers]
```

All input from the browser is untrusted, including:

- request bodies, query strings, cookies, and headers
- socket payloads
- file contents and file names
- push subscription endpoints
- client timestamps

## 3. Threat model (STRIDE-style) and controls

| Threat                                       | Example                                                                        | Controls                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Broken authentication**                    | password guessing, credential stuffing                                         | Argon2id (m=19 MiB, t=2, p=1); login limits per IP+identifier and per IP; generic error messages; common-password denylist; audit events; constant-time comparisons                                                                                |
| **Session theft**                            | XSS reads token; stolen cookie                                                 | Opaque random token in an `HttpOnly; Secure; SameSite=Lax; __Host-` cookie; only its hash in the DB; idle 30 d / absolute 180 d expiry; rotation on login and password change; session list + revoke; sockets disconnected on revoke               |
| **CSRF**                                     | another site POSTs to our API                                                  | SameSite=Lax + per-session CSRF token header on every state change + strict `Origin` check                                                                                                                                                         |
| **Cross-site WebSocket hijacking**           | evil site opens a socket with the user's cookie                                | `Origin` allowlist checked in the Socket.IO handshake                                                                                                                                                                                              |
| **Broken object-level authorization / IDOR** | user changes a conversationId in a request                                     | Every service call authorizes against `ConversationMember` / ownership; 404 for non-members; no client-joinable rooms; automated authorization test matrix (TESTING.md §4)                                                                         |
| **Socket event spoofing**                    | client sends `senderId` or another user's ack                                  | Sender is always `socket.data.userId` (never taken from the payload); strict Zod schemas reject unknown keys; watermarks clamped to `lastSeq`                                                                                                      |
| **NoSQL injection**                          | `{"$gt": ""}` in a JSON field                                                  | Strict Zod schemas parse input into primitives (tested with `{"$gt": ""}`); raw request objects never used as filters; no user input in `$where`/aggregation operators; regex input escaped and length-limited                                     |
| **XSS**                                      | message text containing `<script>`, a malicious GIF URL                        | React escaping only; **no `dangerouslySetInnerHTML`** (ESLint rule); links built from parsed text nodes and only `https:` links allowed; strict CSP (`script-src 'self'`, no inline scripts); GIF URLs restricted to the provider's host allowlist |
| **Malicious uploads**                        | HTML disguised as `.jpg`, polyglots, huge files                                | Signed uploads locked to type/size/folder; server verifies size + real format after upload; files are served from the storage domain, never our origin; `Content-Disposition`/`nosniff` where the provider allows; SVG not allowed                 |
| **Unauthorized media access**                | guessing or sharing media URLs                                                 | Private storage; access only via `GET /api/media/:id` with authorization, then a short-lived URL (provider-dependent — see §8)                                                                                                                     |
| **Information disclosure**                   | stack traces, user enumeration, exposed emails                                 | Central error handler (generic 500s with requestId); identical responses for unknown/known emails; public user projection; presence/last seen filtered by privacy settings + friendship + blocks                                                   |
| **Abuse / spam**                             | friend-request floods, message floods                                          | Messaging limited to friends; rate limits (API.md §4); declined-request cooldown; block; report                                                                                                                                                    |
| **Replay / duplicate submits**               | retried sends, double clicks                                                   | `clientMessageId` uniqueness; one-time email tokens consumed atomically; reset tokens expire after 30 min                                                                                                                                          |
| **Rate-limit bypass**                        | spoofed `X-Forwarded-For`                                                      | `trust proxy` set to exactly the host's proxy hop count; limits keyed by user id when logged in                                                                                                                                                    |
| **Sensitive data in logs**                   | passwords, cookies, message text                                               | pino redaction of `authorization`, `cookie`, `set-cookie`, `password*`, `token`, `text`, `keys`, `endpoint`; requests logged as method/route/status/duration only                                                                                  |
| **Push abuse**                               | registering an attacker-controlled endpoint to receive someone's notifications | Subscriptions bound to the authenticated session; endpoint host must be a known push service; payloads encrypted per subscription (RFC 8291)                                                                                                       |
| **SSRF**                                     | server fetches attacker URLs                                                   | The server only calls fixed provider hosts. Link previews are out of scope for v1 for this reason.                                                                                                                                                 |
| **Dependency vulnerabilities**               | vulnerable package                                                             | Minimal dependencies, lockfile, `npm audit` in the regression checklist, Dependabot once on GitHub                                                                                                                                                 |
| **Secrets leakage**                          | `.env` committed                                                               | `.gitignore` before the first commit; only `.env.example` committed; the server checks env with Zod at startup and refuses to start with missing or weak secrets in production                                                                     |

## 4. Session policy (documented as the prompt requires)

- **Login:** create a new session with a new token and set the cookie. A session id from before login is never reused, which prevents session fixation.
- **Keeping you signed in:** a session stays valid while it's used at least every **30 days**, up to **180 days** in total. After that the user must log in again.
- **Ending a session:** any of these immediately invalidates it and disconnects its sockets:
  - logout
  - revoking from the sessions list
  - password reset (all sessions)
  - password change (all other sessions)
  - account deletion
- **Re-authentication:** password change, email change and account deletion require the current password **in the same request** (no separate "re-auth window" to manage). Signing out other devices needs only the session, since it can only make the account safer.
- **Multiple devices:** each device or browser has its own session. Users can see and revoke them in Settings → Security.

## 5. Security headers (helmet)

- **CSP:**
  ```
  default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' blob: data: <media host> <gif host>; media-src 'self' blob: <media host>;
  connect-src 'self' <media upload host>; font-src 'self'; frame-ancestors 'none';
  base-uri 'self'; form-action 'self'; object-src 'none'; worker-src 'self'
  ```
  `style-src 'self'` will be confirmed in Phase 3; if a library needs inline styles, it will be documented.
- HSTS (production)
- `Referrer-Policy: same-origin`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy` that turns off camera/mic/geolocation (not needed in v1)
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Powered-By` header removed

**CORS:** not enabled, because everything is served from the same origin. Development uses the Vite proxy, so it's same-origin there too. If the app is ever split across origins, a strict allowlist must be added.

## 6. Privacy controls (MVP)

| Control                | Behavior                                                    |
| ---------------------- | ----------------------------------------------------------- |
| Online status          | Friends / Nobody (reciprocal)                               |
| Last seen              | Friends / Nobody (reciprocal)                               |
| Read receipts          | On / Off (reciprocal). Delivered ticks still show.          |
| Discoverable in search | On / Off (Off = exact username only)                        |
| Notification previews  | Name + text / Name only (default) / Nothing ("New message") |
| Block / report         | See API.md §2.3 and §2.5                                    |
| Sessions               | List + revoke                                               |
| Account deletion       | DATABASE.md §4–5                                            |
| Data export            | Later (Phase 10 stretch)                                    |

## 7. Encryption — what we provide and what we don't

| Kind                                     | What it protects against                                                                                | v1?                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transport encryption (TLS/HTTPS/WSS)** | Eavesdroppers on Wi-Fi or the network between the device and our server                                 | **Yes.** Required; HSTS in production.                                                                                                                                                                                                                              |
| **Encryption at rest**                   | Someone stealing the disk or backup files                                                               | **Yes, by the providers.** MongoDB Atlas encrypts storage at rest by default, and Cloudinary/R2 also encrypt stored objects. The keys belong to the providers, so this does **not** hide data from our own server or from someone holding our database credentials. |
| **End-to-end encryption (E2EE)**         | Everyone except the two users, **including our server, its operators, and attackers who compromise it** | **No.**                                                                                                                                                                                                                                                             |

**Decision: v1 is not end-to-end encrypted, and the app and docs will never claim it is.** The server can technically read messages. It's protected by access control, minimal logging, and least-privilege credentials, not by cryptography.

Why E2EE isn't in v1 (it can be added later as its own project):

- **Key management:** each device needs its own identity keys, and new devices must be verified by the user (safety numbers or QR codes).
- **Multiple devices:** messages must be encrypted separately for every device of both users (Signal's Sesame), or the app needs MLS.
- **Account recovery:** losing all devices means losing the message history unless there's an encrypted backup with a recovery key. That's a real UX burden.
- **Media:** files must be encrypted on the client with per-file keys, so the server can't make thumbnails or transcode videos. That breaks the HEVC playback fix.
- **Search:** server search becomes impossible. It would need an on-device index.
- **Notifications:** push payloads would have to be decrypted inside the service worker. That's possible, but it adds complexity on iOS.
- **Implementation:** this must use audited protocols and libraries (Signal protocol via libsignal, or MLS via OpenMLS/wasm). We will never invent our own cryptography.

What v1 does so that E2EE stays possible later:

- Message `type` and content fields are isolated.
- Search, previews, and push go through services that can be swapped for device-side versions.

Optional middle ground, not recommended for v1: server-side field encryption of message text with a key stored in env. It protects only against a database-only leak, it breaks server search, and it doesn't protect against a compromise of our server. Not worth the cost right now.

## 8. Known limitations (initial list — kept up to date)

1. No E2EE (§7).
2. **Media links (confirmed in Phase 8):** media is stored as Cloudinary "authenticated" assets, so it can only be loaded through a URL signed with our secret, and our server hands out such a URL only after checking that the viewer may see it (`GET /api/media/:id` → 302, never cached). On the free plan these signed URLs **do not expire** (time-limited tokens are a paid feature): someone who copies the final `res.cloudinary.com` link out of the browser could share it until the file is deleted. Unsend and the cleanup job delete the file, which ends that link.
3. **GIF searches** go directly from the browser to KLIPY (required by KLIPY's terms), so KLIPY sees the user's IP address and search words. The user id sent to KLIPY is an anonymous hash. Sent GIFs are loaded from `static.klipy.com` by both people.
4. Presence and rate limits are kept in memory on a single instance. Restarting the server resets the counters.
5. Free hosting may sleep, causing delayed first connections.
6. A push notification that's already displayed can't be recalled after unsend.
7. Screenshots and copying can't be prevented on the web.
8. Reports are stored but there's no moderator UI in v1.

## 9. Pre-deployment security checklist (to be completed in Phase 10/11)

- [ ] All secrets from env; production secrets ≥ 32 random bytes; `.env` never committed
- [ ] `NODE_ENV=production`, HTTPS only, HSTS, `__Host-` cookie, `Secure`
- [ ] `trust proxy` set correctly; rate limits verified behind the host proxy
- [ ] CSP active and no console CSP violations in the main user journeys
- [ ] Authorization test matrix passes (REST + sockets)
- [ ] Upload validation tests pass (wrong type, oversize, renamed file)
- [ ] `npm audit --omit=dev` shows no high/critical issues
- [ ] Atlas: least-privilege DB user, network access restricted to the host if possible, backups understood
- [ ] Logs reviewed: no tokens, passwords, cookies, or message text
- [ ] Account deletion and session revocation verified end-to-end
- [ ] Known limitations published in README
