/**
 * What's new — shown once to users after they update.
 *
 * To release an update (docs/SETUP.md "Releasing an update"):
 * 1. Add an entry at the TOP with a higher version and 1–4 short, user-friendly lines.
 * 2. Commit and push. Vercel builds it; open apps see "Adda has been updated" within moments
 *    of being opened or brought back to the screen, and the notes after tapping Reload.
 */
export const RELEASES = [
  {
    version: '1.0.0',
    date: '2026-10-17',
    notes: [
      'Welcome to Adda! Private chats with your friends.',
      'Photos, videos, GIFs, reactions, replies and pinned messages.',
      'Install the app and turn on notifications in Settings.',
    ],
  },
];

export const CURRENT_RELEASE = RELEASES[0];
