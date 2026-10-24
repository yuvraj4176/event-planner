// Client for the planner's JSON API.

const REQUEST_TIMEOUT_MS = 30_000;
const NETWORK_MESSAGE = 'The planner could not be reached. Check your connection and try again.';

export class ApiError extends Error {
  constructor(message, { status = 0, errors = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

// Converts any failure into the field error list the form knows how to show.
export function toFieldErrors(error) {
  if (error instanceof ApiError && error.errors.length > 0) return error.errors;
  return [{ field: 'form', message: error?.message || 'Something went wrong. Please try again.' }];
}

export function createApi(fetchImpl = globalThis.fetch.bind(globalThis)) {
  async function request(path, body) {
    let response;
    try {
      response = await fetchImpl(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(NETWORK_MESSAGE);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const failure = payload?.error;
      throw new ApiError(failure?.message ?? 'The request could not be completed.', {
        status: response.status,
        errors: Array.isArray(failure?.errors) ? failure.errors : [],
      });
    }
    return payload;
  }

  return {
    getMeta: () => request('/api/meta'),
    createPlan: (event, today) => request('/api/plan', { event, today }),
    requestIdeas: (event, today) => request('/api/ideas', { event, today }),
    ask: (event, today, question) => request('/api/ask', { event, today, question }),
    chat: (message, history, event, today) => request('/api/chat', { message, history, event, today }),
  };
}
