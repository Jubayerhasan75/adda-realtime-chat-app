# Adda

A private, real-time, one-to-one messaging web app (MERN + Socket.IO), installable as a PWA on Android, iPhone/iPad (iOS 16.4+), and desktop.

> **Status:** Phase 10 in progress — Adda: installable app with updates, push notifications, presence, photos/videos/GIFs, messaging and friends. Hosting: Vercel (app) + Render (server). See [docs/STATUS.md](docs/STATUS.md).

Everything in this project uses free, open-source software and free service tiers. No payment card is needed.

## Quick start (Windows, VS Code terminal)

Requirements: Node.js 24 LTS and a free MongoDB Atlas database ([docs/SETUP.md](docs/SETUP.md) step 2).

1. Install dependencies (from the project folder):

   ```bash
   npm install
   ```

2. Create your private env file and put your Atlas connection string in it:

   ```powershell
   Copy-Item server\.env.example server\.env
   ```

3. Start the API (port 4000) and the web app (port 5173) together, then open http://localhost:5173. Until email is configured, verification and reset links are printed in this terminal (look for "DEV EMAIL"):

   ```bash
   npm run dev
   ```

## Scripts (run from the project folder)

| Command             | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run dev`       | Starts server and client with auto-reload                                |
| `npm run dev:phone` | Same, and also opens it to phones on your Wi-Fi (see SETUP)              |
| `npm test`          | Runs all unit and integration tests (uses a temporary MongoDB)           |
| `npm run test:e2e`  | Builds the client and runs browser tests with Playwright                 |
| `npm run lint`      | ESLint + circular-import check                                           |
| `npm run build`     | Production build of the client into `client/dist`                        |
| `npm start`         | Runs the server, which also serves the built client (single origin)      |
| `npm run check`     | lint + format check + tests + build — must pass before finishing a phase |

## Documentation

| Document                             | Contents                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| [REQUIREMENTS](docs/REQUIREMENTS.md) | Scope, decisions, open questions, risks, acceptance criteria |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Stack, diagrams, folder layout, real-time design, PWA/iOS    |
| [DATABASE](docs/DATABASE.md)         | Collections, indexes, ER diagram, retention                  |
| [API](docs/API.md)                   | REST endpoints and Socket.IO event contract                  |
| [SECURITY](docs/SECURITY.md)         | Threat model, session policy, encryption decision, checklist |
| [TESTING](docs/TESTING.md)           | Test strategy and phase gate                                 |
| [ROADMAP](docs/ROADMAP.md)           | Work breakdown structure, phases 0–12                        |
| [SETUP](docs/SETUP.md)               | Tools, accounts, and credentials — step by step              |
| [STATUS](docs/STATUS.md)             | Progress log, test results, next step                        |
| [UX_CHECKLIST](docs/UX_CHECKLIST.md) | Phone experience checks run every phase                      |

## Security note

Messages are **end-to-end encrypted**: text, captions, edits, reply quotes and the chosen GIF are encrypted on the sender's device and can only be decrypted by the two people in the chat — not by the server or its operators. Encryption keys stay on the devices; the server stores only public keys and a backup locked by the user's recovery passphrase. See [E2EE](docs/E2EE.md) for the design and its honest limits.

Photos and videos are not yet end-to-end encrypted (in progress, see [E2EE §4](docs/E2EE.md)). Until then they are protected by access-checked, signed links, HTTPS and the hosting provider's encryption at rest. All traffic uses HTTPS/WSS.

## License

Copyright (c) 2026 Jubayer Hasan. All rights reserved.

This is proprietary software. Copying, modifying, redistributing or deploying any part of it without written permission is not allowed. See [LICENSE](LICENSE).
