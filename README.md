# 📸 Social Media Auto-Poster

An agent that posts **one photo + one caption** to your **Instagram** and **Facebook Page** — automatically, **3 times a day** (default **6:00 · 12:00 · 18:00** EAT), with a live dashboard to watch everything it does.

- **No AI, no surprises:** each slot takes the photo and caption used the *longest ago* and posts your caption **exactly as written** — nothing is rewritten, nothing is invented
- **Content:** drop photos + captions into the [`data/`](./data/README.md) folder, push to GitHub — done
- **Switch pages anytime:** the target page lives in **one file** (`data/config.json`) — change the `pageId`, push, and the agent re-connects to the new page automatically
- **Works on Vercel, Netlify, or any Node host:** the same repo deploys anywhere
- **Dashboard:** connection health, library, post history with permalinks, live activity log, manual "Post now" and a safe "Test pick" dry-run

---

## How it works

```
data/photos/*.jpg ─┐
data/captions.txt ─┼─► import on start (or "Scan data folder" button)
data/config.json ─┘          │
                             ▼
              ┌──────────────────────────────┐
   6:00/12:00 │  Scheduler (30s ticks /     │
   18:00 EAT  │  cron hits /api/cron)       │
              └──────────────┬───────────────┘
                             ▼
        Rotation pick (least-recently-used photo + caption)
                             │
                             ▼
        Instagram (Graph API, 2-step publish) + Facebook Page (/photos)
                             │
                             ▼
              Post history + permalinks in the dashboard
```

Missed a slot because the server was restarting? The **catch-up window** (default 60 min) posts it as soon as the agent is back online — without ever double-posting the same slot.

## Quick start (local)

```bash
bun install          # or: npm install
bun run dev          # or: npm run dev
```

Open http://localhost:3000 — everything the agent needs (photos, captions, tokens, target page) lives in [`data/`](./data/README.md), scanned on every start.

> Node works too (`npm run dev`). Bun is just faster.

## Where your content goes

See **[`data/README.md`](./data/README.md)** for the full guide. Short version:

| You provide | Where | Notes |
|---|---|---|
| Photos | `data/photos/` | `.jpg/.jpeg`, ≥320px wide, ≤8MB. |
| Captions | `data/captions.txt` | One caption per section, separated by `---` lines. Posted exactly as written. |
| Tokens & target page | `data/config.json` | Template: `data/config.example.json`. |

The same things can also be managed from the dashboard (upload, edit, activate/deactivate, bulk captions).

## Switching to another page (the one-file switch)

Everything you might change later lives in **`data/config.json`**:

| Field | What it is |
|---|---|
| `metaUserToken` | Your Facebook access token (the master key) |
| `appId` / `appSecret` | Your Meta app credentials |
| **`pageId`** | **The page the agent posts to — change this to switch pages** |
| `pageName`, `igUserId`, `igUsername` | Informational — auto-refreshed on connect |
| `timezone`, `slots` | The schedule |

To post to a different page: change `pageId` (or just `igUsername`) in `data/config.json`, commit, push. On the next start or cron hit the agent detects the change, fetches the new page's token, and starts posting there — photos and captions carry over unchanged. The `_readme` field inside the file lists the page IDs available to your token.

## Environment variables

All of these are optional when `data/config.json` is committed (the config file wins for empty fields; env vars are the alternative for public repos).

| Variable | Purpose |
|---|---|
| `META_ACCESS_TOKEN` | Facebook user token with the 5 permissions below. |
| `META_APP_ID` / `META_APP_SECRET` | Enables the ~60-day long-lived token exchange. |
| `PUBLIC_BASE_URL` | Auto-captured on the first dashboard visit / cron hit. |
| `CRON_SECRET` | Protects `/api/cron` when set. |
| `DEDUP_GUARD_MINUTES` | Serverless duplicate-post guard (default 30). |

**Meta token permissions** (grant them in the Graph API Explorer): `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`. Your Instagram account must be a Business/Creator account linked to the Facebook Page.

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this there 🙂).
2. In Vercel: **Add New → Project → Import** this repo.
3. **Nothing else to configure** — this repo deliberately carries its `.env` and `data/config.json` (tokens, page connection) so the deployment works out of the box: on every cold start the agent re-imports the `data/` folder and re-connects to the page set in `data/config.json`.

   > Keeping credentials in a **private** repo is a deliberate trade-off for convenience. If you ever make this repo **public**, first move the values into **Vercel → Settings → Environment Variables** and delete `.env` + `data/config.json` from git.
4. Deploy. Open your `https://<project>.vercel.app` — the dashboard shows the agent connecting and importing the `data/` folder.

### The clock on Vercel

Serverless apps don't run timers in the background — they need to be *pinged*. This repo includes `vercel.json` with two daily crons — **03:17 UTC (06:17 EAT)** and **15:17 UTC (18:17 EAT)** — covering the morning and evening posts. The Hobby plan's cron limit (2 daily jobs) is why the third slot needs one extra step:

**To cover the midday 12:00 EAT slot too, add a free external cron** (2 minutes):

1. Create a free account at [cron-job.org](https://cron-job.org) (or EasyCron / UptimeRobot's heartbeat).
2. Create a job with URL `https://<your-project>.vercel.app/api/cron` running **every 5–10 minutes**.
3. Done. Every ping checks the slots; the catch-up window + duplicate guard make sure nothing is double-posted.

On the **Vercel Pro** plan you can instead edit `vercel.json` to add a third cron (`17 9 * * *`) or run hourly and skip the external service.

> **Vercel Hobby note:** the free plan resets the serverless filesystem between invocations — the agent handles this by rebuilding its library from the `data/` folder on every cold start and by checking Instagram/Facebook for the last post before publishing (duplicate guard). Your post *history* view therefore shows the current instance's activity; for a fully persistent history, run the agent on an always-on host (Railway/Render/VPS) — same repo, zero changes.

## Deploying to Netlify

The repo is Netlify-ready (`netlify.toml` + a scheduled function):

1. In Netlify: **Add new site → Import an existing project** → pick this repo.
2. The build uses the official Next.js plugin automatically — no settings needed. The committed `.env` / `data/config.json` work the same as on Vercel.
3. The clock is included: `netlify/functions/agent-cron.ts` is a scheduled function that pings `/api/cron` **every 10 minutes** — all 3 daily slots fire on time with no external service and no plan upgrade.

> **Netlify note:** same serverless story as Vercel — the filesystem resets, the library rebuilds from `data/` on every cold start, and the Meta-side duplicate guard prevents double-posting.

## The "never silent" guarantee

There is no AI in the pipeline — nothing to fail between "your caption file" and "the published post". The only external calls are the Meta publishing APIs themselves; if one platform errors (token expired, image rejected), the post is recorded with the exact error and the other platform still gets its post (status "partial" in the history table). Slots missed while the host was offline fire within the catch-up window when it wakes up.

You can verify the whole path without posting: **Overview tab → "Test pick"** — it shows exactly which photo and caption the rotation would publish right now.

## Dashboard guide

- **Overview** — countdown to the next post, connection health, token days-left, post history with IG/FB permalinks, live activity log, **Post now** and **Test pick**.
- **Photos** — upload/scan, activate/deactivate, usage counts.
- **Captions** — add one or many (`---`-separated), edit, activate/deactivate, usage counts.
- **Setup** — Meta connect wizard (auto-detects your pages + linked Instagram), schedule (slots, timezone, catch-up window).

## API reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Everything the dashboard shows. |
| `/api/cron` | GET | One scheduler pass (for Vercel/Netlify/external cron). |
| `/api/import` | POST | Re-scan the `data/` folder. |
| `/api/run` | POST | Manual post now. Body `{"dryRun": true}` = test pick. |
| `/api/photos` | GET/POST | List / upload (multipart `files`). |
| `/api/photos/:id/raw` | GET | Public image URL used by Meta (`?size=thumb`). |
| `/api/captions` | GET/POST | List / add (`{"text"}` or `{"texts": [...]}`). |
| `/api/posts` | GET | Last 60 posts. |
| `/api/settings` | GET/PUT | Read / update settings. |
| `/api/setup/connect` | POST | Meta connect wizard backend. |

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Token needs attention" | Tokens expire (~60 days for long-lived). Generate a fresh token in the Graph API Explorer and update `metaUserToken` in `data/config.json` (or reconnect in Setup). |
| Post failed: image URL | The public URL wasn't captured yet — open the dashboard once (it self-captures) or set `PUBLIC_BASE_URL`. |
| "Library empty" skip | No active photos or captions — drop files in `data/` and press "Scan data folder". |
| Instagram rejects image | JPEG only, ≥320px wide, ≤8MB. Very tall images (over 4:5) get cropped to 4:5 — square photos are the safest choice. |
| Facebook error `(#200)` | The token lacks `pages_manage_posts` — regenerate it in the Graph API Explorer with that permission ticked. |
| Not posting at slot times | Your cron isn't set up or too sparse — see "The clock" sections above. |
| Switched pages but still posting to the old one | Check that `pageId` in `data/config.json` really changed, then push and press "Scan data folder" (or wait for the next cron hit). |
