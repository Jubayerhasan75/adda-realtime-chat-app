import { v2 as cloudinary } from 'cloudinary';

const UPLOAD_TTL_MS = 10 * 60 * 1000;

const ALLOWED_FORMATS = {
  image: 'jpg,png,webp,gif,heic,heif',
  video: 'mp4,mov,webm',
};

// Every video is converted once, right after upload, to H.264/AAC MP4, which plays on every
// browser (iPhones record HEVC, which most Android and desktop browsers can't play).
const VIDEO_PLAYBACK = {
  crop: 'limit',
  width: 1280,
  height: 1280,
  quality: 'auto',
  video_codec: 'h264',
  audio_codec: 'aac',
};

const VARIANTS = {
  image: {
    thumb: {
      transformation: [
        { crop: 'limit', width: 720, height: 720, quality: 'auto', fetch_format: 'auto' },
      ],
    },
    full: {
      transformation: [
        { crop: 'limit', width: 2048, height: 2048, quality: 'auto', fetch_format: 'auto' },
      ],
    },
    avatar: {
      transformation: [
        {
          crop: 'fill',
          gravity: 'face',
          width: 256,
          height: 256,
          quality: 'auto',
          fetch_format: 'auto',
        },
      ],
    },
  },
  video: {
    full: { format: 'mp4', transformation: [VIDEO_PLAYBACK] },
    poster: {
      format: 'jpg',
      transformation: [
        { start_offset: 0, crop: 'limit', width: 720, height: 720, quality: 'auto' },
      ],
    },
  },
};

/**
 * A signed link that makes the browser save the file ("fl_attachment"). Photos keep their
 * original quality; iPhone HEIC photos become JPEG and videos MP4, so they open everywhere.
 */
function downloadUrl(key, kind, mimeType) {
  const name = kind === 'video' ? 'adda_video' : 'adda_photo';
  const format = kind === 'video' ? 'mp4' : /heic|heif/.test(mimeType ?? '') ? 'jpg' : undefined;
  return cloudinary.url(key, {
    resource_type: kind,
    type: 'authenticated',
    sign_url: true,
    secure: true,
    urlAnalytics: false,
    flags: `attachment:${name}`,
    ...(kind === 'video' ? { transformation: [VIDEO_PLAYBACK] } : {}),
    ...(format ? { format } : {}),
  });
}

// Encrypted parts are stored as "raw" files (no extension: Cloudinary refuses .bin).
const resourceType = (kind) => (kind === 'blob' ? 'raw' : kind);

const statusOf = (err) => err?.http_code ?? err?.error?.http_code;

/**
 * Cloudinary SDK errors carry the full request, including the API key and secret
 * (`request_options.auth`). Never rethrow or log them as they are: keep only the message
 * and status code.
 */
export function providerError(action, err) {
  const cause = {
    message: String(err?.error?.message ?? err?.message ?? 'unknown'),
    http_code: statusOf(err),
  };
  return new Error(`Cloudinary ${action} failed: ${cause.message}`, { cause });
}

/**
 * Cloudinary (free plan, no card). Files are uploaded straight from the browser with a signed,
 * short-lived request and stored as "authenticated" assets: they can only be viewed through a
 * URL signed with our secret, which our server hands out after checking who is asking
 * (docs/SECURITY.md §8 explains the remaining limitation).
 * @param {{ url: string }} options CLOUDINARY_URL
 */
export function createCloudinaryStorage({ url }) {
  const parsed = new URL(url);
  const cloudName = parsed.hostname;
  const apiKey = decodeURIComponent(parsed.username);
  const apiSecret = decodeURIComponent(parsed.password);
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  const eagerVideo = `${cloudinary.utils.generate_transformation_string({ ...VIDEO_PLAYBACK })}/mp4`;

  return {
    name: 'cloudinary',
    origins: { upload: ['https://api.cloudinary.com'], media: ['https://res.cloudinary.com'] },

    async prepareUpload({ key, kind }) {
      const params = {
        timestamp: Math.floor(Date.now() / 1000),
        public_id: key,
        type: 'authenticated',
        ...(ALLOWED_FORMATS[kind] ? { allowed_formats: ALLOWED_FORMATS[kind] } : {}),
        ...(kind === 'video' ? { eager: eagerVideo, eager_async: 'true' } : {}),
      };
      const signature = cloudinary.utils.api_sign_request(params, apiSecret);
      return {
        url: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType(kind)}/upload`,
        fields: { ...params, api_key: apiKey, signature },
        expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
      };
    },

    /** What Cloudinary actually stored (its own format detection), or null if nothing was. */
    async inspect({ key, kind }) {
      try {
        const resource = await cloudinary.api.resource(key, {
          resource_type: resourceType(kind),
          type: 'authenticated',
        });
        return {
          bytes: resource.bytes,
          format: resource.format === 'jpeg' ? 'jpg' : resource.format,
          width: resource.width ?? null,
          height: resource.height ?? null,
          durationMs: resource.duration ? Math.round(resource.duration * 1000) : null,
        };
      } catch (err) {
        if (statusOf(err) === 404) return null;
        throw providerError('lookup', err);
      }
    },

    async remove({ key, kind }) {
      try {
        await cloudinary.uploader.destroy(key, {
          resource_type: resourceType(kind),
          type: 'authenticated',
          invalidate: true,
        });
      } catch (err) {
        throw providerError('delete', err);
      }
    },

    deliveryUrl({ key, kind, variant, mimeType }) {
      if (kind === 'blob') {
        return cloudinary.url(key, {
          resource_type: 'raw',
          type: 'authenticated',
          sign_url: true,
          secure: true,
          urlAnalytics: false,
        });
      }
      if (variant === 'download') return downloadUrl(key, kind, mimeType);
      const options =
        kind === 'video'
          ? VARIANTS.video[variant === 'full' ? 'full' : 'poster']
          : VARIANTS.image[variant === 'poster' ? 'thumb' : variant];
      return cloudinary.url(key, {
        resource_type: kind,
        type: 'authenticated',
        sign_url: true,
        secure: true,
        urlAnalytics: false,
        ...options,
      });
    },
  };
}
