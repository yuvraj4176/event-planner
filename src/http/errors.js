/** @module http/errors */

/**
 * An HTTP error with client-safe message, status code, and optional headers.
 */
export class HttpError extends Error {
  /**
   * @param {number} status - HTTP status code
   * @param {string} message - Client-safe error message
   * @param {{ details?: object, headers?: Record<string, string> }} [options]
   */
  constructor(status, message, { details, headers } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    this.headers = headers ?? {};
  }
}
