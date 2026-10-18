// Security policy constants (documented in docs/SECURITY.md §4).
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A session ends after 30 days without use… */
export const SESSION_IDLE_MS = 30 * DAY;
/** …and after 180 days in total, even if used every day. */
export const SESSION_ABSOLUTE_MS = 180 * DAY;
/** `lastUsedAt` is written at most this often, to avoid a DB write on every request. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * MINUTE;

export const TOKEN_LIFETIME_MS = {
  verify_email: 1 * DAY,
  reset_password: 30 * MINUTE,
  change_email: 1 * DAY,
};
