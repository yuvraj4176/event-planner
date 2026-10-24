// An error whose message is safe to show to the client.
export class HttpError extends Error {
  constructor(status, message, { details, headers } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    this.headers = headers ?? {};
  }
}
