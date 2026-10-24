# Security policy

## Reporting a vulnerability

Please report security problems privately, using a private security advisory on the repository or by contacting the maintainers directly. Do not open a public issue or publish details until a fix is available.

## What is protected and how

The full list of controls, with where each one lives and how it is tested, is in [docs/SECURITY.md](docs/SECURITY.md). In short:

- All input is validated on the server and all output is rendered as text.
- A strict content security policy forbids inline code and outside origins.
- The server checks the Host and Origin headers, rate limits requests and limits their size.
- The Gemini API key is read from the environment or a git-ignored `.env` file, is sent only in a header, and is never logged or shown to the browser.
- The project has no runtime or development dependencies to keep patched.
