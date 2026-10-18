/**
 * An expected, client-facing error. Anything else that reaches the error handler is treated
 * as an internal failure and its details are never sent to the client.
 */
export class AppError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} code one of ERROR_CODES
   * @param {string} message safe, human-readable message
   * @param {Array<{ path: string, issue: string }>} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
