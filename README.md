# 📸 Social Media Auto-Posting Agent

An AI-powered agent that posts **one photo + one caption** to your **Instagram** and **Facebook Page** — automatically, **3 times a day** (default **6:00 · 12:00 · 18:00** EAT), with a live dashboard to watch everything it does.

- **AI:** [Groq](https://groq.com) (`groq/compound`) picks the best photo–caption pair for each time slot
- **Never silent:** if Groq fails (down, wrong key, timeout) the agent **still posts** using its own rotation — this is guaranteed in code, not a hope
- **Content:** drop photos + captions into the [`data/`](./data/README.md) folder, push to GitHub — done
- **Dashboard:** connection health, library, post history with permalinks, live activity log, manual "Post now" and a safe "Test pick" dry-run

---

## How it works

```
data/photos/*.jpg ─┐
data/captions.txt ─┼─► import on start (or "Scan data folder" button)
data/config.json ─┘          │
                             ▼
              ┌──────────────────────────┐
   6:00/12:00 │  Scheduler (30s ticks /  │
   18:00 EAT  │  cron hits /api/cron)    │
              └───────────┬──────────────┘
                          ▼
        Groq picks photo + caption  ──fails?──►  LRU rotation pick
                          │
                          ▼
        Instagram  (Graph API, 2-step publish)  +  Facebook Page (/photos)
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

Open http://localhost:3000 — the Setup tab walks you through connecting your Facebook/Instagram. Everything the agent needs can live in [`data/`](./data/README.md) (photos, captions, tokens) — the folder is scanned on every start.

> Node works too (`npm run dev`). Bun is just faster.

## Where your content goes

See **[`data/README.md`](./data/README.md)** for the full guide. Short version:

| You provide | Where | Notes |
|---|---|---|
| Photos | `data/photos/` | `.jpg/.jpeg`, ≥320px wide, ≤8MB. Optional `<name>.jpg.txt` side-file with a description (helps the AI match). |
| Captions | `data/captions.txt` | One caption per section, separated by `---` lines. |
| Tokens & keys | `data/config.json` (local) or env vars (Vercel) | Template: `data/config.example.json`. |

The same things can also be managed from the dashboard (upload, edit, activate/deactivate, bulk captions).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | local only | SQLite path. Leave unset on Vercel. |
| `GROQ_API_KEY` | yes (for AI) | Your Groq key. |
| `GROQ_MODEL` | no | Default `groq/compound`. |
| `META_ACCESS_TOKEN` | yes | Facebook user token with the 5 permissions below. |
| `META_APP_ID` / `META_APP_SECRET` | recommended | Enables the ~60-day long-lived token exchange. |
| `PUBLIC_BASE_URL` | no | Auto-captured on the first dashboard visit / cron hit. |
| `CRON_SECRET` | no | Protects `/api/cron` when set. |
| `DEDUP_GUARD_MINUTES` | no | Serverless duplicate-post guard (default 30). |

**Meta token permissions** (grant them in the Graph API Explorer): `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`. Your Instagram account must be a Business/Creator account linked to the Facebook Page.

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this there 🙂).
2. In Vercel: **Add New → Project → Import** this repo.
3. **Nothing else to configure** — this repo deliberately carries its `.env` and `data/config.json` (tokens, page connection, Groq key) so the deployment works out of the box: on every cold start the agent re-imports the `data/` folder and restores the "Teacher's Lesson Plan" page connection directly.

   > Keeping credentials in a **private** repo is a deliberate trade-off for convenience. If you ever make this repo **public**, first move the values into **Vercel → Settings → Environment Variables** (`GROQ_API_KEY`, `GROQ_MODEL`, `META_ACCESS_TOKEN`, `META_APP_ID`, `META_APP_SECRET`) and delete `.env` + `data/config.json` from git.
4. Deploy. Open your `https://<project>.vercel.app` — the dashboard shows the agent connecting to your pages and importing the `data/` folder.

### The clock: cron setup (important)

Serverless apps don't run timers in the background — they need to be *pinged*. This repo includes `vercel.json` with two daily crons — **03:17 UTC (06:17 EAT)** and **15:17 UTC (18:17 EAT)** — which cover the morning and evening posts. The Hobby plan's cron limit (2 daily jobs) is why the third slot needs one extra step.

**To cover the midday 12:00 EAT slot too, add a free external cron** (2 minutes):

1. Create a free account at [cron-job.org](https://cron-job.org) (or EasyCron / UptimeRobot's heartbeat).
2. Create a job with URL `https://<your-project>.vercel.app/api/cron` running **every 5–10 minutes**.
3. Done. Every ping checks the slots; the catch-up window + duplicate guard make sure nothing is double-posted.

On the **Vercel Pro** plan you can instead edit `vercel.json` to `"schedule": "0 * * * *"` (hourly) and skip the external service.

> **Vercel Hobby note:** the free plan only allows *daily* cron schedules, hence the external-cron recommendation above. It also resets the serverless filesystem between invocations — the agent handles this by rebuilding its library from the `data/` folder on every cold start and by checking Instagram/Facebook for the last post before publishing (duplicate guard). Your post *history* view on Vercel therefore shows the current instance's activity; for a fully persistent history, run the agent on an always-on host (Railway/Render/VPS) — same repo, zero changes.

## The "AI fails, posting continues" guarantee

Every AI touchpoint is wrapped in a fallback:

| AI step | If Groq fails |
|---|---|
| Picking the photo–caption pair | Sequential rotation (least-recently-used photo + caption) |
| Polishing the caption (optional feature) | Original caption is posted as-is |
| Groq test/connectivity | Agent keeps working without AI until you fix the key |

You can verify this yourself: **Overview tab → "Test pick"** — it runs the full selection and shows what the agent *would* post, without publishing. Set an invalid Groq key in Setup, press Test pick, and watch it fall back to rotation.

## Dashboard guide

- **Overview** — countdown to the next post, connection health, token days-left, post history with IG/FB permalinks, live activity log, **Post now** and **Test pick**.
- **Photos** — upload/scan, per-photo description (AI hint), activate/deactivate, usage counts.
- **Captions** — add one or many (`---`-separated), edit, activate/deactivate, usage counts.
- **Setup** — Meta connect wizard (auto-detects your pages + linked Instagram), schedule (slots, timezone, catch-up window), AI settings (model, key, page theme), "Test Groq" button.

## API reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Everything the dashboard shows. |
| `/api/cron` | GET | One scheduler pass (for Vercel/external cron). |
| `/api/import` | POST | Re-scan the `data/` folder. |
| `/api/run` | POST | Manual post now. Body `{"dryRun": true}` = test pick. |
| `/api/photos` | GET/POST | List / upload (multipart `files`). |
| `/api/photos/:id/raw` | GET | Public image URL used by Meta (`?size=thumb`). |
| `/api/captions` | GET/POST | List / add (`{"text"}` or `{"texts": [...]}`). |
| `/api/posts` | GET | Last 60 posts. |
| `/api/settings` | GET/PUT | Read / update settings. |
| `/api/setup/connect` | POST | Meta connect wizard backend. |
| `/api/ai/test` | POST | Groq connectivity test. |

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Token needs attention" | Tokens expire (~60 days for long-lived). Generate a fresh token in the Graph API Explorer and reconnect in Setup, or update `META_ACCESS_TOKEN` on Vercel. |
| Post failed: image URL | The public URL wasn't captured yet — open the dashboard once (it self-captures) or set `PUBLIC_BASE_URL`. |
| "Library empty" skip | No active photos or captions — drop files in `data/` and press "Scan data folder". |
| Instagram rejects image | JPEG only, ≥320px wide, ≤8MB. Very tall images (over 4:5) get cropped to 4:5 — square photos are the safest choice. |
| Not posting at slot times on Vercel | Your external cron isn't set up or too sparse — see "The clock" above. |
