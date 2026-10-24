# Contributing

Thank you for helping to improve Celebration Planner.

## Set up

You need Node.js 22 or later. There is nothing to install.

```bash
npm run dev     # start the site at http://127.0.0.1:3000 and restart on changes
npm run check   # lint, syntax check and all tests
```

To try the Gemini features, copy `.env.example` to `.env` and add your key. The file is ignored by git.

## Principles

- **Keep it small.** No runtime or development dependencies. Prefer a short function over a library.
- **Keep logic pure.** Planning, formatting and reporting are functions of their inputs. Anything that touches the outside world (the network, storage, the clock, the page) is passed in.
- **Render text as text.** Build page content with `h()` and `textContent`. Never use `innerHTML`.
- **Accessibility is a requirement.** Labels, keyboard use, focus, contrast and reduced motion are checked by tests. Do not add colours without adding them to the contrast test.
- **No emoji** anywhere, in code, documents or the interface. Icons are drawn from `public/js/icons.js`.

## Making a change

1. Write or update a test first. Tests live in `tests/`, grouped by area.
2. Keep each source file under 200 lines. Split it when it grows.
3. Run `npm run check`, and `npm run coverage` for changes to behaviour.
4. Update the documents in `docs/` when you change how something works.

## Adding an event type

Add one data file in `src/planner/data/` and register it in `src/planner/eventTypes.js`. The data tests check that percentages total 100, ids are unique and vendors map to budget lines.

## Adding an icon

Add its shapes to `public/js/icons.js` and mark where it goes with `data-icon="name"`.
