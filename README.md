# 📸 Social Media Auto-Poster

An agent that posts **one photo + one caption** to your **Instagram** and **Facebook Page** — automatically, **3 times a day** (default **6:00 · 12:00 · 18:00** EAT), with a live dashboard to watch everything it does.

- **No AI, no surprises:** each slot takes the photo and caption used the *longest ago* and posts your caption **exactly as written** — nothing is rewritten, nothing is invented
- **Content:** drop photos + captions into the [`data/`](./data/README.md) folder, push to GitHub — done
- **Switch pages anytime:** the target page lives in **one file** (`data/config.json`) — change the `pageId`, push, and the agent re-connects to the new page automatically
- **Host it 3 ways:** on **GitHub itself** (Actions — recommended, zero external services), or deploy the same repo to **Vercel / Netlify** — your choice
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

Missed a slot because the server was restarting? The **catch-up window** (default 4 hours — `graceMinutes` in `data/config.json`) posts it as soon as the agent is back online — without ever double-posting the same slot. If even that passes, a manual **force** run still posts the same day's missing slot.

## Running on GitHub Actions — the agent hosted by GitHub itself

**No web host at all.** GitHub's own servers run the agent for you, for free:

- `.github/workflows/social-agent.yml` is triggered by GitHub's cron **every 30 minutes, around the clock** — but the timing barely matters (see the next bullet)
- **Facebook: Meta does the punctual publishing.** Each landed run pre-schedules the next `scheduleDays` days (default 3) of FB posts with **Meta's own scheduled publishing** (`scheduled_publish_time`) — the same infrastructure Meta Business Suite uses. Meta's servers publish each FB post at exactly its slot time, even if GitHub never fires again that day.
- **Instagram: catch-up posting.** Instagram's API has **no working scheduling** (the `publish_time` container field is silently ignored — `media_publish` posts immediately; verified experimentally 2026-09-22). So the IG half of each slot is posted directly by the first landed run after the slot time (within the 4-hour catch-up window). FB is always exact; IG is exact whenever a run lands near the slot, minutes-to-hours late otherwise, and force-dispatch rescues the rest.
- Why not rely on GitHub firing at slot time? GitHub **silently drops most scheduled runs** on young accounts (observed live: 3 of 30 fires landed one day, 1 of 70 the next). One landed run every ~2 days keeps the whole horizon booked — and landed runs also record permalinks, mark posts published, and late direct posting (4-hour catch-up, `graceMinutes`) remains the fallback
- It publishes to Instagram + Facebook **directly from the repo files** and commits the state file `data/state.json` (done slots, rotation counters, event log) back to the repo, so every run knows what already happened
- Run history + logs live in your repo's **Actions tab**; a failed run shows red **and emails you** — nothing fails silently

**No image hosting needed.** Instagram's API requires a public image URL. Instead of maintaining an external host, the agent uploads each photo to your Facebook Page as an **invisible (unpublished) photo**, hands Instagram its CDN URL, publishes on Instagram, then deletes the hidden helper photo. Facebook is posted via direct binary upload. The whole image pipeline lives inside Meta's own infrastructure — there is nothing else to configure or pay for.

**You never touch the workflow file.** Everything you'd ever change lives in `data/config.json`:

| You want to… | You do |
|---|---|
| Change posting times / timezone | Edit `slots` / `timezone` in `data/config.json` and push |
| Add photos & captions | Drop files in `data/photos/` + `data/captions.txt`, push (unchanged) |
| Switch pages | Set `pageId` + a fresh `metaUserToken`, push — the agent mints the new page's permanent token and saves it back to the config |
| Pause everything | Set `"autoPost": false` in `data/config.json` and push — the next landed run also deletes any pending Meta-scheduled posts |
| Post right now / rescue a missed slot | Actions tab → **Social Media Agent** → **Run workflow** → tick `force` — it posts the most recent unposted slot, even one already marked missed (same day) |
| Test without publishing | Same, but tick `dryRun` |

**Free-tier facts** (private repo, GitHub Free): only runs that START bill minutes — realistically ~2-5 landed runs/day ≈ 100-300 of the 2000 monthly included minutes. The agent's state commits keep the repository active, so the schedule is never auto-disabled for inactivity. GitHub drops most scheduled fires on young accounts — which is exactly why the agent pre-schedules with Meta instead of trusting GitHub's timing.

> **One host at a time.** The GitHub runner, a Vercel deployment, and a local dev server each keep their own "what's posted" state. Running two of them on the same page can double-post (the 30-minute Meta-side duplicate guard catches most collisions, but not a same-minute race). Pick **one** active host — if you deploy to Vercel later, disable the workflow (or set `"autoPost": false`) first.

### ✅ Already activated — nothing to set up

`.github/workflows/social-agent.yml` is committed in this repo, so GitHub runs the schedule immediately. The first landed run pre-books 3 days of posts with Meta — from then on, posts go out exactly at 06:00 / 12:00 / 18:00 EAT from Meta's own servers. Watch runs land: repo → **Actions** tab → **Social Media Agent**.

<details>
<summary>How activation works (reference / fresh clones)</summary>

GitHub requires the special *workflows* permission for any token that creates or modifies workflow files. This repo's automation token has it, so the file was pushed automatically. In a fresh clone with a token that lacks it, either grant it (Settings → Developer settings → Personal access tokens → **Workflows: Read and write**) or paste `data/workflow-template.yml` into a new file named `.github/workflows/social-agent.yml` via the web UI.

</details>

**Every automation change is rehearsed safely.** A second workflow, `.github/workflows/verify.yml`, fires automatically whenever the workflow files change: it performs a **dry-run of the full scheduled pipeline on a real GitHub runner** — checkout → photo normalization → agent connects to Meta and picks the next slot's content — and appends the outcome to `data/runner-verified.txt`. Nothing is ever published. You can also run it anytime: Actions tab → **Verify agent runner** → Run workflow.

> **Optional — trigger runs from scripts:** the browser "Run workflow" button always works. To also dispatch runs via the GitHub API (curl, scripts), grant the fine-grained PAT **Actions: Read and write** as well. The schedule itself needs no permissions at all.

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
| `pageAccessToken` | The page's permanent token — auto-maintained by the agent; posting keeps working even after `metaUserToken` expires |
| `pageName`, `igUserId`, `igUsername` | Informational — auto-refreshed on connect |
| `timezone`, `slots` | The schedule |
| `scheduleDays` | Days ahead Meta pre-schedules posts (default 3; 2-7 recommended; 1 = disable pre-scheduling, rely on catch-up) |
| `graceMinutes` | How long past a slot a late landed run may still post it directly (default 240) |
| `autoPost` | Set `false` to pause automatic posting (the next landed run also cancels pending Meta-scheduled posts) |

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

> The GitHub Actions workflow (see above) is the recommended host. Vercel/Netlify below remain fully supported alternatives for when you want the web dashboard online.

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
| "Token needs attention" | Tokens expire (~60 days for long-lived). Generate a fresh token in the Graph API Explorer and update `metaUserToken` in `data/config.json` (or reconnect in Setup). The `pageAccessToken` itself never expires — posting continues even while `metaUserToken` is expired. |
| GitHub run is red | Open the run in the Actions tab — the log states the exact Meta error. Typical causes: token revoked (regenerate + update `metaUserToken`), image rejected (see below), or a partial post (one platform OK, the other errored). |
| Post failed: image URL | On web hosts: the public URL wasn't captured yet — open the dashboard once (it self-captures) or set `PUBLIC_BASE_URL`. (The GitHub runner doesn't need a public URL at all.) |
| "Library empty" skip | No active photos or captions — drop files in `data/` and press "Scan data folder". |
| Instagram rejects image | On the GitHub runner this is handled for you — every run auto-converts PNGs, crops to 4:5…1.91:1 and scales images before posting. If you still see it: corrupt file or extreme dimensions — replace the file. |
| Facebook error `(#200)` | The token lacks `pages_manage_posts` — regenerate it in the Graph API Explorer with that permission ticked. |
| Not posting at slot times | GitHub Actions: check the Actions tab for red runs. Web hosts: your cron isn't set up or too sparse — see "The clock" sections above. |
| Want to stop posting for a while | Set `"autoPost": false` in `data/config.json` and push. |
| Switched pages but still posting to the old one | Check that `pageId` in `data/config.json` really changed (plus a fresh `metaUserToken` when switching on the GitHub runner), then push — the next run reconnects. |
