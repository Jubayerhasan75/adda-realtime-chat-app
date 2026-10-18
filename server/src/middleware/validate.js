import { ERROR_CODES } from '@chat/shared';
import { AppError } from '../utils/AppError.js';

function validationError(error) {
  const details = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    issue: issue.message,
  }));
  return new AppError(
    400,
    ERROR_CODES.VALIDATION_FAILED,
    'Please check the highlighted fields',
    details,
  );
}

/**
 * Validates and normalizes `req.body` with a Zod schema, replacing it with the parsed value
 * so handlers only ever see clean, typed input.
 * @param {import('zod').ZodType} schema
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates the query string. Express 5 makes `req.query` read-only, so the parsed value is
 * stored on `req.validatedQuery`.
 * @param {import('zod').ZodType} schema
 */
export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}
