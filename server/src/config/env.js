import { z } from 'zod';

const DEFAULT_MAIL_TRANSPORT = { development: 'console', test: 'memory', production: 'smtp' };

const isLocalHost = (hostname) =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z
      .string({ error: 'is required (see docs/SETUP.md step 2)' })
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
    // Public origin the browser uses to reach the app; used for Origin checks, email links
    // and security headers.
    APP_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Number of reverse proxies in front of the app (0 locally, usually 1 on hosting platforms).
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Directory of the built client to serve; defaults to client/dist inside this repository.
    CLIENT_DIST_DIR: z.string().optional(),

    // Email (docs/SETUP.md step 4). console = print links to the terminal (development only),
    // memory = keep in RAM for automated tests, smtp = really send.
    // brevo = Brevo's HTTPS email API (for hosts that block SMTP ports, like Render's free plan).
    // mailjet = Mailjet's HTTPS email API (same reason; no phone verification needed).
    MAIL_TRANSPORT: z.enum(['console', 'memory', 'smtp', 'brevo', 'mailjet']).optional(),
    BREVO_API_KEY: z.string().trim().min(20).optional(),
    MAILJET_API_KEY: z.string().trim().min(10).optional(),
    MAILJET_SECRET_KEY: z.string().trim().min(10).optional(),
    MAIL_FROM: z.string().min(3).default('Adda <no-reply@localhost>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),

    // Media (docs/SETUP.md step 5). cloudinary = real storage; local = files on this computer
    // (development and tests only); none = uploads disabled. Defaults to cloudinary when
    // CLOUDINARY_URL is set, otherwise local outside production.
    MEDIA_STORAGE: z.enum(['cloudinary', 'local', 'none']).optional(),
    // The "API environment variable" from the Cloudinary dashboard:
    // cloudinary://<api_key>:<api_secret>@<cloud_name>
    CLOUDINARY_URL: z
      .string()
      .regex(/^cloudinary:\/\/[^:@\s]+:[^:@\s]+@[\w-]+$/, {
        error: 'must look like cloudinary://<api_key>:<api_secret>@<cloud_name>',
      })
      .optional(),
    LOCAL_MEDIA_DIR: z.string().optional(),
    // How long a user stays "online" after their last device goes away (tests use less).
    PRESENCE_OFFLINE_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(8000),

    // Web Push (docs/SETUP.md step 6). Generated once, kept forever: changing the pair breaks
    // every existing subscription. Without them, push notifications are off.
    VAPID_PUBLIC_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{80,100}$/, 'must be a VAPID public key')
      .optional(),
    VAPID_PRIVATE_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{40,50}$/, 'must be a VAPID private key')
      .optional(),
    // Contact for push services: mailto: or https: (defaults to APP_ORIGIN when it is https).
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/)/, 'must start with mailto: or https://')
      .optional(),

    // GIFs (docs/SETUP.md step 7): KLIPY app key. Optional — without it GIFs are unavailable.
    KLIPY_APP_KEY: z.string().trim().min(8).max(200).optional(),
  })
  .transform((env) => ({
    ...env,
    MAIL_TRANSPORT: env.MAIL_TRANSPORT ?? DEFAULT_MAIL_TRANSPORT[env.NODE_ENV],
    MEDIA_STORAGE:
      env.MEDIA_STORAGE ??
      (env.CLOUDINARY_URL ? 'cloudinary' : env.NODE_ENV === 'production' ? 'none' : 'local'),
  }))
  .refine((env) => env.NODE_ENV !== 'production' || env.APP_ORIGIN.startsWith('https://'), {
    path: ['APP_ORIGIN'],
    message: 'must use https:// in production',
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || !isLocalHost(new URL(env.APP_ORIGIN).hostname),
    {
      path: ['APP_ORIGIN'],
      message: 'must be the public address of the app in production, not localhost',
    },
  )
  .refine((env) => env.NODE_ENV !== 'production' || !/localhost/i.test(env.MAIL_FROM), {
    path: ['MAIL_FROM'],
    message: 'must be a real sender address in production, e.g. Adda <no-reply@yourdomain>',
  })
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' || ['smtp', 'brevo', 'mailjet'].includes(env.MAIL_TRANSPORT),
    {
      path: ['MAIL_TRANSPORT'],
      message: 'must be smtp, brevo or mailjet in production (console/memory never deliver email)',
    },
  )
  .refine(
    (env) => env.MAIL_TRANSPORT !== 'mailjet' || (env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY),
    {
      path: ['MAILJET_API_KEY'],
      message: 'MAILJET_API_KEY and MAILJET_SECRET_KEY are required when MAIL_TRANSPORT=mailjet',
    },
  )
  .refine((env) => env.MAIL_TRANSPORT !== 'brevo' || env.BREVO_API_KEY, {
    path: ['BREVO_API_KEY'],
    message: 'is required when MAIL_TRANSPORT=brevo',
  })
  .refine((env) => Boolean(env.VAPID_PUBLIC_KEY) === Boolean(env.VAPID_PRIVATE_KEY), {
    path: ['VAPID_PRIVATE_KEY'],
    message: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together',
  })
  .refine((env) => env.MEDIA_STORAGE !== 'cloudinary' || env.CLOUDINARY_URL, {
    path: ['CLOUDINARY_URL'],
    message: 'is required when MEDIA_STORAGE=cloudinary',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.MEDIA_STORAGE !== 'local', {
    path: ['MEDIA_STORAGE'],
    message: 'local storage is for development only (files would be lost on redeploy)',
  })
  .refine(
    (env) => env.MAIL_TRANSPORT !== 'smtp' || (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
    { path: ['SMTP_HOST'], message: 'SMTP_HOST, SMTP_USER and SMTP_PASS are required for smtp' },
  );

/**
 * Parses and validates environment variables. Throws a readable error listing every problem,
 * without echoing the (possibly secret) values.
 * @param {Record<string, string | undefined>} [source]
 */
export function loadEnv(source = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return Object.freeze({ ...result.data, APP_ORIGIN: new URL(result.data.APP_ORIGIN).origin });
}

/** @typedef {ReturnType<typeof loadEnv>} Env */
