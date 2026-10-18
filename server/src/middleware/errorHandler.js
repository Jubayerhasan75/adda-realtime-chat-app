import { ERROR_CODES } from '@chat/shared';
import { AppError } from '../utils/AppError.js';

/** @type {import('express').RequestHandler} */
export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, ERROR_CODES.NOT_FOUND, 'Resource not found'));
}

// Errors raised by express.json() carry a `type`; map them to our public error codes.
const BODY_PARSER_ERRORS = {
  'entity.too.large': () => new AppError(413, ERROR_CODES.TOO_LARGE, 'Request body is too large'),
  'entity.parse.failed': () =>
    new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Request body is not valid JSON'),
  'encoding.unsupported': () =>
    new AppError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 'Unsupported request encoding'),
};

/** @type {import('express').ErrorRequestHandler} */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError =
    err instanceof AppError
      ? err
      : (BODY_PARSER_ERRORS[err?.type]?.() ??
        new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong'));

  if (appError.status >= 500) {
    req.log.error({ err }, 'Unhandled error');
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      requestId: req.id,
    },
  });
}
