import pino from 'pino';

// Defence in depth: request/response serializers below already avoid logging these,
// but any object logged by application code is redacted too.
const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.text',
  '*.keys',
  '*.endpoint',
];

/**
 * @param {import('./env.js').Env} env
 */
export function createLogger(env) {
  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
          }
        : undefined,
  });
}
