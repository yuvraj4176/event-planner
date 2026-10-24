# Architecture

## Goals

1. Keep the technology simple enough that any developer can read the whole project in an hour.
2. Keep planning logic pure and testable, separate from HTTP and from the AI.
3. Make the product useful without AI, and better with it.

## Overview

```
Browser (ES modules)                          Node.js server (no dependencies)
--------------------                          --------------------------------
index.html + main.js  --- JSON over HTTP --->  app.js: security headers, rate limits, routing
  formView, resultsView                           routes/api.js: validate, then call
  views/ (budget, timeline, ...)                    planner/   pure plan builders and event data
  store.js (local storage)                          ai/        Gemini client, prompts, cache, fallback
  progress.js, format.js, api.js                  http/staticFiles.js: serves public/ from memory
```

## Server

| Module | Responsibility |
| --- | --- |
| `server.js` | Composition root: loads config, creates the AI client, starts the server, handles shutdown signals |
| `src/app.js` | Builds the HTTP server. Applies security headers, parses the URL, enforces rate limits, reads JSON bodies, converts errors to responses |
| `src/routes/api.js` | Declares the endpoints as `{ method, path, limit, handler }` records. Handlers are plain async functions |
| `src/http/*` | Small single-purpose modules: body reader, router, rate limiter, host guard, static files, security headers, error type |
| `src/planner/*` | The product logic. Everything here is a pure function of its inputs |
| `src/ai/*` | Everything that talks to a model |

Dependencies are passed in (`createApp({ config, aiClient, logger, now })`) rather than imported globally, so tests substitute a fake AI client, a silent logger and a controllable clock.

## Planner

`planFromRequest(raw, today)` validates, then `buildPlan(input, today)` assembles:

- **Budget** (`budget.js`). The contingency reserve is a fixed share. The rest is divided across categories in proportion to their weights, with prioritised categories boosted by 1.4. Division uses the largest remainder method, which guarantees integer amounts that sum to the total exactly.
- **Timeline** (`timeline.js`). Every task is defined as "N days before the event". A date scaler turns that into a date. When the event is closer than the template span, earlier tasks are scaled proportionally and clamped between today and the event, keeping their order. Post-event tasks are unaffected. The plan reports `compressed` so the interface can explain what happened.
- **Vendors** (`vendors.js`). Each vendor links to a budget line, so the vendor list shows its allocated amount. Booking deadlines use the same date scaler as the timeline, so the two never disagree. Vendors are ordered by lead time.
- **Ideas** (`ideas.js`). Each idea carries tags and optional limits (guest count, budget tier). Eligible ideas are ranked by how many tags match the user's theme and interests, then the list is completed with one idea per category in turn so it stays varied.
- **Validation** (`validate.js`). Only known fields are copied into the validated object. Text is cleaned of control and bidirectional override characters. Every failure is reported at once with a field name.

Dates are `YYYY-MM-DD` strings handled in UTC, so results do not depend on server time zone. The browser sends its own calendar date so "today" matches the user's, and the server accepts it only when it is within one day of the server date.

Event content lives in `src/planner/data/*.js` as plain objects. A test checks their integrity: percentages total 100, ids are unique, vendors map to budget lines, and so on. Adding a fourth event type means adding one data file and registering it in `eventTypes.js`.

## AI

- `geminiClient.js` calls the Gemini `generateContent` API with the key in a header. It keeps an ordered list of models and a small pool that remembers which are cooling down. A model that is out of quota, overloaded, retired, slow or silent is set aside (for 15 seconds to an hour, depending on the failure, or for the length of a `Retry-After` header) and the next model is tried, so one exhausted model never stops the assistant. A rejected API key is the only failure that stops the chain. If every model fails, one error is raised and the service falls back to the built-in planner. An overall time budget stops a long chain of slow models.
- `prompts.js` builds prompts. User text is stripped of angle brackets and placed inside tagged blocks that the system prompt marks as untrusted data. Model output is parsed defensively: only well-formed items are kept, lengths are capped, and the client renders everything as text.
- `assistantService.js` also serves the floating chat: it sends earlier turns as untrusted text, adds the visitor's saved plan as context when there is one, and falls back to plan-specific or general site answers when no model is available.
- `assistantService.js` combines the client and the planner. Each method always returns a usable result and a `source` field (`ai` or `builtin`). Only successful AI idea results are cached, for ten minutes.

## Deployment on Vercel

`createRequestHandler` in `src/app.js` builds the function that answers one request. `createApp` wraps it in a Node server together with the static files, for running locally. On Vercel, `api/_handler.js` uses the same handler without static files, and each file in `api/` re-exports it so that Vercel routes `/api/<name>` to it. Vercel serves `public/` itself and `vercel.json` sets the same security headers on those files. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Print and download

`planReport.js` turns a plan and its progress into one plain description. `printSheet.js` draws it as the printed document (shown only when printing, styled by `print.css`) and `exportText.js` writes it as a text file, so both always contain the same information. `printing.js` rebuilds the print sheet just before the browser prints.

## Chat assistant

`public/js/chatbot.js` builds a floating launcher and a non-modal dialog on every page (`site.js` mounts it). `chatMessages.js` builds the message bubbles, suggestions and typing indicator, and `chatStore.js` keeps the conversation in session storage for the life of the tab. The chat reads the saved plan from local storage and sends it with each message, so answers can be personalised. All text is attached as text, never as markup.

## Browser

- `main.js` only connects the page's elements, the server and storage. `plannerPage.js` holds the page logic and receives everything it touches from outside, so it is tested without a browser; `pageElements.js` lists the element ids it needs. `resultsView.js` assembles the results. `views/*` each build one section and own their updates.
- `dom.js` provides `h()`, an element builder that attaches text as text nodes. There is no `innerHTML` anywhere (a test enforces this).
- `progress.js` holds pure functions for completed tasks, vendor steps and spending. `store.js` validates everything it reads back, because local storage can hold anything.
- Views update the part of the page that changed. Ticking a task changes one status label and the summary figures, not the whole list.

## Key decisions

| Decision | Reason |
| --- | --- |
| No framework, no bundler | Fewer moving parts, nothing to audit, instant start |
| No runtime dependencies | No supply chain risk, no vulnerability updates to track |
| Server rebuilds the plan on every AI call | The client is never trusted to supply plan data |
| Plans stored in the browser | No accounts, no personal data on the server |
| AI is optional and always has a fallback | The product works offline from the AI and the user is told which source answered |
| Strict content security policy | Defence in depth if markup ever reached the page |
