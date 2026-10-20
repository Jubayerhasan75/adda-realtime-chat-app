/** Product limits shared by client and server (docs/REQUIREMENTS.md D14, docs/DATABASE.md). */
export const LIMITS = Object.freeze({
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  DISPLAY_NAME_MAX: 40,
  BIO_MAX: 160,
  EMAIL_MAX: 254,
  PASSWORD_MIN: 10,
  PASSWORD_MAX: 128,
  MESSAGE_TEXT_MAX: 4000,
  USERNAME_CHANGE_COOLDOWN_DAYS: 7,
  MESSAGE_EDIT_WINDOW_MINUTES: 15,
  MESSAGE_UNSEND_WINDOW_HOURS: 24,
  MAX_PINNED_MESSAGES: 10,
  SEARCH_QUERY_MIN: 2,
  SEARCH_QUERY_MAX: 100,
  // Media (docs/REQUIREMENTS.md §2.4). Image/video caps match the Cloudinary free plan.
  MAX_ATTACHMENTS: 10,
  IMAGE_MAX_BYTES: 10 * 1024 * 1024,
  VIDEO_MAX_BYTES: 100 * 1024 * 1024,
  UPLOADS_PER_HOUR: 600,
  // End-to-end encrypted media (docs/E2EE.md §4): files are uploaded as encrypted parts.
  BLOB_MAX_BYTES: 9.5 * 1024 * 1024,
  MESSAGE_MAX_BLOBS: 130,
  // Groups (docs/GROUPS.md).
  GROUP_MAX_MEMBERS: 50,
  GROUP_NAME_MAX: 50,
});
