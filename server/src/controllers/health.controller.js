import { ERROR_CODES } from '@chat/shared';
import { pingDatabase } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

/** Liveness: the process is running and can answer HTTP. */
export function getLiveness(_req, res) {
  res.json({ data: { status: 'ok' } });
}

/** Readiness: the app can serve real traffic (database reachable). */
export async function getReadiness(req, res) {
  try {
    await pingDatabase();
  } catch (err) {
    req.log.warn({ err }, 'Readiness check failed');
    throw new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, 'Database is unavailable');
  }
  res.json({ data: { status: 'ok', database: 'up' } });
}
