# Environment, Services and Credentials

Status: guide for Phase 2 onward (updated 2026-10-16). **Zero-cost rule:** every service below is free and needs no payment card. **Never paste passwords, connection strings, or secret keys into the chat.** Put them only in the local `.env` files described below. Those files are git-ignored.

## 1. Your PC (checked 2026-10-16)

| Tool           | Found         | Needed     | Action                                                                |
| -------------- | ------------- | ---------- | --------------------------------------------------------------------- |
| Node.js        | **24.20.0**   | 24.x LTS   | Done — installed via winget on 2026-10-16 (was 22.17.1)               |
| npm            | 11.6.2        | 11.x       | OK (comes with Node)                                                  |
| Git            | 2.50.0        | ≥ 2.40     | OK                                                                    |
| VS Code        | 1.140         | any recent | OK                                                                    |
| MongoDB server | not installed | not needed | We use Atlas for dev; tests download their own `mongod` automatically |
| Docker         | not installed | not needed | –                                                                     |

## 2. Credentials overview

| Value                                                    | Needed for                  | Who creates it                              | Required when                                               | Free tier                                                |
| -------------------------------------------------------- | --------------------------- | ------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `MONGODB_URI` (dev)                                      | Database                    | You, in MongoDB Atlas                       | **Phase 2**                                                 | Yes — M0: 512 MB, shared CPU, 1 free cluster per project |
| `SESSION_SECRET`, `CSRF_SECRET`                          | Signing / HMAC              | Generated locally by a command (no account) | Phase 4                                                     | –                                                        |
| SMTP host/port/user/pass + `MAIL_FROM`                   | Verification & reset emails | You, at the email provider                  | Phase 4 for real emails (dev can use the console transport) | Yes (limits below)                                       |
| Cloudinary cloud name / API key / API secret             | Photos, videos, avatars     | You                                         | **Phase 8**                                                 | Yes, no card (limits below)                              |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push                    | Generated locally by a command (no account) | Phase 9                                                     | –                                                        |
| GIF provider API key                                     | GIF search                  | You                                         | Phase 8 — **optional**                                      | Provider-dependent                                       |
| Hosting account + production values                      | Deployment                  | You                                         | **Phase 11 only**                                           | Render free (sleeps when idle)                           |

Production must have separate values for everything: its own Atlas project and DB user, and new secrets and VAPID keys.

## 3. Step-by-step

### Step 1 — Node.js 24 LTS ✅ done

Installed on 2026-10-16. If VS Code's terminal still shows an old version, close and reopen VS Code, then check:

```bash
node -v
```

Expected: `v24.x.x`.

### Step 2 — Create a MongoDB Atlas dev database (needed now)

Why: it's the durable store for all data. Atlas clusters are replica sets, which we need for transactions.

1. Sign up at https://www.mongodb.com/cloud/atlas/register (free, no card required for M0).
2. Create a project named `private-chat-dev`, then **Create cluster → M0 Free**, choosing the region closest to you (e.g. Mumbai `ap-south-1` or Singapore).
3. **Database Access → Add user**: authentication _Password_. Generate a strong password with the built-in generator. Role: _Read and write to any database_ is acceptable for dev; production will use a database-scoped role.
4. **Network Access → Add IP Address → Add current IP address.** Avoid `0.0.0.0/0` for dev.
5. **Connect → Drivers → Node.js**. Copy the `mongodb+srv://...` string. Insert your DB user's password and add the database name `chat_dev` after the host: `...mongodb.net/chat_dev?retryWrites=true&w=majority`.
6. **Don't send it to me.** Create your private env file from the template. In a VS Code terminal opened in the project folder (PowerShell):

   ```powershell
   Copy-Item server.env.example server.env
   ```

   Open `server/.env` in VS Code and replace the whole `MONGODB_URI=...` line with your string. The file is git-ignored.

7. Start both apps from the project folder:

   ```bash
   npm run dev
   ```

8. Verify: open http://localhost:5173. The page must show **API: ok** and **Database: up**. If it shows an error, the server terminal (magenta `server` lines) explains why. Common causes: wrong password in the URI, or your IP isn't in Atlas Network Access. Stop the apps with Ctrl+C.

### Step 3 — Generate local secrets (Phase 4; I'll remind you)

These need no account. The value is printed in your terminal and you paste it into `server/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Step 4 — Email provider (Phase 4)

Two free options that don't need a domain:

- **Brevo** free plan (about 300 emails/day): verify a **single sender** address (e.g. your Gmail), then SMTP & API → SMTP → create an SMTP key.
- **Gmail SMTP** (about 500 emails/day): turn on 2-Step Verification for the Google account, then create an **App password**. Prefer a separate Gmail account for the app rather than your personal one.

Without your own domain, some emails may land in spam. That's an accepted limitation of the zero-cost setup.

- Values in `server/.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
- Free-tier numbers change. I'll re-check the provider's current pricing page with you before you sign up.
- Until then, dev uses the **console mail transport**: verification links are printed in the server terminal. It's labelled as dev-only and disabled in production.

### Step 5 — Media storage (Phase 8)

- **Cloudinary** free plan (checked 2026-10-17): 25 credits per month shared between storage, bandwidth and transformations (1 credit = 1 GB storage, or 1 GB bandwidth, or 1,000 transformations). Max 10 MB per photo, 100 MB per video. **No card required.**
- One value in `server/.env`: `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`. Copy it from the dashboard (**Settings → API Keys**, or the "API environment variable" on the home page). It contains the API secret: keep it only in `server/.env` (and later in the hosting dashboard), never in chat or git.
- **API key role:** Cloudinary gives new API keys no permissions. In **Settings → Role Management**, assign the key a role; on the free plan only **Master Admin** works for uploads. That is acceptable because the key never leaves `server/.env`.
- The **cloud name** is shown at the top-left of the Cloudinary console. It is not the API key's name ("Root" or "private").
- Without it, development stores files in `server/.media` on your computer (the server log says so). Production refuses local storage.
- (Cloudflare R2 was rejected because activating it requires a payment method.)

### Step 6 — VAPID keys for Web Push (Phase 9) ✅

No account needed. In Phase 9 the key pair was generated on your computer and written into `server/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Keep the same pair forever: in Phase 11 the same two values go into the hosting dashboard. The private key is a secret. `VAPID_SUBJECT` is optional; it defaults to the app's https address.

**Try notifications on your computer:** `npm run app:local`, open http://localhost:4000, Settings → Notifications → Turn on. Then minimise the window, and send yourself a message from your second account in another browser (or a private window).

### Step 7 — GIF provider (Phase 8, optional)

Reviewed 2026-10-17:

- **Tenor**: Google shut down the public Tenor API on 30 June 2026 (no new keys since January). Not usable.
- **GIPHY**: free "beta" keys are limited to 100 requests per hour; production keys need approval and possibly payment.
- **KLIPY** ✅ chosen: free API key from the partner panel, no card. Its terms require the browser to call KLIPY directly (no server proxy), media loaded from the URLs it returns, results shown in its order, and the attribution "Search KLIPY" placeholder + "Powered by KLIPY".

Value in `server/.env`: `KLIPY_APP_KEY=...` (optional). The app key is sent to the browser by design, because KLIPY requires browser-side requests. Without a key, the GIF button shows "GIFs aren't available", never a broken picker.

### Try the app on your real phone (development)

1. Phone and computer on the **same Wi-Fi**.
2. Run `npm run dev:phone`. The terminal shows a line like `Network: http://192.168.0.105:5173/`.
3. Open that address in the phone's browser. If Windows asks whether Node.js may use the network, allow **Private networks** only.
4. Sign in as usual. Notifications and installing the app need HTTPS, so they are tested after deployment (Phase 11).

### Releasing an update (after going live)

1. Write the change. Then add a new entry at the top of `client/src/releaseNotes.js` with a higher version (e.g. `1.1.0`), the date, and 1–4 short lines for users.
2. Run `npm run check`, commit, and push to GitHub. Vercel builds and publishes it automatically (Render too, for server changes).
3. Users with the app open see **"A new version of Adda is ready — Later / Update"** within moments of opening or returning to it. After **Update** they see "What's new". They can also use Settings → About & updates → **Check for updates**.

### Step 8 — Hosting (Phase 11 only)

- **Render free web service** (no card): sleeps after about 15 minutes without traffic; the next visit takes ~30–60 s to wake it. The app shows "Reconnecting…" meanwhile. This is an accepted limitation.
- The final free host is re-checked in Phase 11, because free-tier rules change.

It supports WebSockets and HTTPS on a provided subdomain, so a custom domain is optional. I'll walk through it in Phase 11.

## 4. How we keep secrets private

- `.gitignore` is created **before** the first commit and includes `.env*` except `.env.example`.
- The server validates env at startup and never logs secret values.
- Secrets are never placed in client code. Only values prefixed `VITE_` reach the browser, and we'll only use that prefix for public values.
- If a secret is ever exposed (e.g. committed), rotate it immediately at the provider. Deleting the commit isn't enough.
