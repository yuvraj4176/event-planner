# Deploying to Vercel

The site is ready to deploy on Vercel. Vercel serves the pages in `public/` from its own network and runs the API as serverless functions in `api/`. Nothing needs to be built or installed.

## Steps

1. Push the project to a GitHub repository. The `.env` file is ignored by git, so your key is never uploaded.
2. In Vercel, choose **Add New... Project** and import the repository.
3. Leave the framework preset as **Other**. The settings in `vercel.json` already set the output folder to `public` and turn off the build and install steps.
4. Open **Environment Variables** and add your key:

   | Name | Value |
   | --- | --- |
   | `GEMINI_API_KEY` | your Gemini API key |

   Add it for the Production environment, and for Preview if you want the chat to work on preview deployments.
5. Choose **Deploy**.

When it finishes, open the address Vercel gives you. The chat window shows "Powered by Gemini" when the key is working. Without a key the site still works, using the built-in planner.

## Optional settings

Set these in the same place. All have sensible defaults.

| Name | Default on Vercel | Purpose |
| --- | --- | --- |
| `GEMINI_MODELS` | the list in the README | Models tried in order |
| `AI_TIMEOUT_MS` | `8000` | Time limit for each model. Two attempts must fit inside the function limit |
| `RATE_LIMIT_MAX` | `120` | API requests per visitor per minute |
| `AI_RATE_LIMIT_MAX` | `20` | AI requests per visitor per minute |
| `ALLOWED_HOSTS` | any | Restrict the host names the API answers to, for example your own domain |

## How it differs from running it locally

| | Local (`npm start`) | Vercel |
| --- | --- | --- |
| Pages | Served by `server.js` | Served by Vercel's network, with the same security headers set in `vercel.json` |
| API | One server process | One serverless function per route, all sharing `api/_handler.js` |
| Visitor address | The connection address | The `X-Forwarded-For` header that Vercel sets (`TRUST_PROXY` is on) |
| Host check | Local names only | Any name, because the site is reached by its public address |
| Settings | `.env` file or environment | Environment variables in the Vercel project |
| Rate limits | Kept in memory for the life of the server | Kept in memory per function instance, so they reset when an instance restarts |

## Things to know

- **Function time.** Each function may run for up to 30 seconds (`maxDuration` in `vercel.json`, within the free plan's limit). With the default eight second limit per model, the assistant can try several models inside that time.
- **Rate limits are per instance.** Serverless functions do not share memory, so the limits slow down abuse but are not an exact global count. For hard limits, add Vercel's firewall or a shared store.
- **Cold starts.** The first request after a quiet period starts a new function, which adds a short delay. Pages are not affected, because they are served from the network.
- **Data.** Nothing is stored on the server. Plans stay in each visitor's browser.
- **Preview deployments.** Vercel can add its own comment toolbar to preview pages. The strict content security policy blocks that script, which only affects previews.

## Checking a deployment

```bash
curl https://YOUR-SITE.vercel.app/api/health
```

should return `{"status":"ok"}`. Then open the site, create a plan, and send a message in the chat.
