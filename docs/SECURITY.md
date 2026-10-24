# Security

## Data handled

The application stores nothing on the server. Event details are sent to the server to build a plan and are not logged or persisted. The plan and progress are kept in the user's own browser. If the Gemini assistant is switched on, a short description of the event, the visitor's question and recent chat turns are sent to Google's Gemini API to produce an answer; nothing else is shared.

## Controls

| Area | Control | Where |
| --- | --- | --- |
| Input validation | Every field is checked for type, range and length. Unknown fields are dropped. Control characters and bidirectional overrides are removed | `src/planner/validate.js` |
| Output encoding | The client builds the page with `textContent` and text nodes only. No `innerHTML`, `eval` or `document.write` (enforced by a test) | `public/js/dom.js` |
| Content security policy | `default-src 'none'`; scripts, styles, images and connections limited to the same origin; no inline code; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'none'` | `src/http/security.js` |
| Other headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, cross-origin isolation headers | `src/http/security.js` |
| Request limits | JSON content type required, body size limited (32 KiB by default), URL length limited, header and request timeouts set | `src/http/body.js`, `src/app.js` |
| Host and origin checks | The Host header must be one of this server's names (defeats DNS rebinding), and requests that change something must come from this site (defeats cross-site requests that spend the AI quota) | `src/http/hostGuard.js` |
| Rate limiting | 120 API requests per minute per client, and 20 AI requests (ideas, questions and chat) per minute | `src/http/rateLimiter.js` |
| Static files | Served from an in-memory table built at startup, so a request path can never reach a file outside `public/`. Only known file types are loaded | `src/http/staticFiles.js` |
| Error handling | Unexpected errors return a generic message. Details are logged without request content | `src/app.js` |
| Secrets | The Gemini key is read only from the environment or the git-ignored `.env` file, held in a closure, sent to Google in a header (never in a URL), never logged, never sent to the browser, and never appears in error messages | `src/config.js`, `src/env.js`, `src/ai/geminiClient.js` |
| Prompt injection | User text is stripped of angle brackets and placed inside tagged data blocks. The system prompt marks those blocks as untrusted. Model output is parsed, length limited and rendered as text, so a manipulated answer cannot run code | `src/ai/prompts.js` |
| Model failover | A failing model is set aside for a limited time and the next is tried, with an overall time budget, so a quota problem cannot make requests hang | `src/ai/geminiClient.js` |
| Chat input | Messages are limited to 500 characters, history to ten turns of 1,500 characters, malformed turns are dropped, and an invalid saved plan is ignored | `src/routes/api.js`, `src/ai/prompts.js` |
| Denial of wallet | AI calls have a timeout, a lower rate limit and a cache for repeated requests | `src/ai/assistantService.js` |
| Local storage tampering | Saved data is validated against the expected shape on load and discarded if it does not match | `public/js/store.js` |
| Dependencies | None at runtime or for development | `package.json` |
| Transport | `Strict-Transport-Security` is sent over encrypted connections | `src/http/security.js` |
| Fatal errors | Unhandled errors are logged without request content and the process stops instead of continuing in an unknown state; invalid settings stop the server with one clear message | `server.js` |
| Proxy awareness | The visitor's address for rate limiting is read from `X-Forwarded-For` only when `TRUST_PROXY` is on, because anyone can forge that header when the server is reached directly | `src/http/clientAddress.js` |
| Static pages on Vercel | `vercel.json` sets the same security headers as the server, and a test checks that the two lists are identical | `vercel.json`, `tests/vercel.test.js` |
| Network exposure | Binds to `127.0.0.1` unless `HOST` is set | `src/config.js` |

## Verification

Security behaviour is covered by automated tests: path traversal attempts, malformed and oversized requests, wrong content types and methods, rate limiting, header presence, error message hygiene, secrets staying out of logs and errors, prompt delimiter escape attempts, hostile text in AI output, and a repository scan for credentials and unsafe DOM calls. See `tests/server.test.js`, `tests/ai/*` and `tests/quality/hygiene.test.js`.

## Deployment guidance

- Serve over HTTPS. Set `ALLOWED_HOSTS` to your domain name. If a reverse proxy ends HTTPS, add `Strict-Transport-Security` there.
- The built-in rate limiter keys on the connection address. Behind a proxy every request appears to come from the proxy, so also rate limit at the proxy.
- Keep `GEMINI_API_KEY` in a secret manager or the host's environment settings, or in a `.env` file that is never committed. `.env` files are ignored by git.
- Set a spending limit on the API key.

## Reporting a vulnerability

Open a private security advisory on the repository or contact the maintainers directly. Please do not publish details before a fix is available.
