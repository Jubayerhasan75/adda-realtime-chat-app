/**
 * Only allow same-site relative paths as post-login destinations. Rejects absolute URLs and
 * protocol-relative "//evil.example" values (open-redirect protection).
 */
export function safeRedirect(target, fallback = '/chats') {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) {
    return fallback;
  }
  if (target.startsWith('/\\')) return fallback;
  return target;
}
