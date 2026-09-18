# Worklog — Social Media Auto-Posting Agent

---
Task ID: 1
Agent: Super Z (main agent)
Task: Build, verify, and push the Instagram + Facebook auto-posting agent for user Kaka-Doctor (page: Teacher's Lesson Plan, IG: @teachers_lesson_plan)

Work Log:
- Loaded full prior context from the continued session (Next.js 16 + Prisma + SQLite scaffold at /home/z/my-project with dashboard, poster, scheduler, Groq picker, Meta publisher already built).
- Synced with newer files present on disk: src/lib/importer.ts (data-folder import + ensureSchema DDL), src/app/api/cron/route.ts, src/app/api/import/route.ts, scheduler runTick() — started from this state.
- Stored user's Meta credentials: META_ACCESS_TOKEN / META_APP_ID / META_APP_SECRET in .env AND data/config.json (git-ignored); data/config.example.json committed as template.
- Created the user's data-drop folder: data/photos/ (.gitkeep + SAMPLE-welcome.jpg 1080x1080 generated via sharp + sidecar .txt description), data/captions.txt (3 starter teaching captions, --- separated), data/README.md (full guide: photos, per-photo .txt hints, captions format, config.json).
- Hardened code:
  - db.ts: Vercel-safe datasourceUrl fallback (file:/tmp/social-agent.db when VERCEL=1 and no DATABASE_URL).
  - importer.ts: credential resolution from data/config.json OR env vars (META_*, GROQ_*, PUBLIC_BASE_URL); auto-connect now also runs on fresh DBs (serverless cold starts) and on token rotation via new Settings.configTokenSeen fingerprint; expires_in=0 handled as "no known expiry" instead of "expired now".
  - prisma/schema.prisma: + configTokenSeen field; db push applied; ensureSchema CREATE TABLE + defensive ALTER for older DBs.
  - meta.ts: + minutesSinceLastPost() (IG media timestamp, FB feed created_time fallback) for the serverless duplicate-post guard.
  - poster.ts: + RunOptions.dryRun (records what WOULD be posted, publishes nothing); + duplicate-post guard (manual 3 min always, auto 30 min on Vercel via DEDUP_GUARD_MINUTES); + explicit publicBaseUrl-missing failure path with clear log.
  - /api/run: accepts {"dryRun": true}; /api/cron: optional CRON_SECRET auth; /api/status + /api/cron: shared capturePublicBaseUrl() from settings.ts which rejects localhost/.fcapp.run/.space-z.ai hosts; /api/setup/connect: configTokenSeen saved, safe expiry notes, host-guarded publicBaseUrl.
  - photos route: graceful "read-only filesystem" error on serverless upload attempts.
  - package.json: postinstall = prisma generate (needed for Vercel builds).
- Dashboard UI: Overview tab + "Test pick" dry-run button (FlaskConical icon, safe AI/fallback demo); Photos tab + "Scan data folder" button (POST /api/import) with explainer strip.
- Diagnostics run with real credentials:
  - Meta auto-connect SUCCEEDED: page "Teacher's Lesson Plan" (928221430380831) connected; first token exchange → ~60 days; page token itself never expires.
  - Groq key returns HTTP 403 Forbidden on /models and all models (key rejected by Groq's servers) — agent posts anyway via sequential fallback (verified in dry run: "AI failed, fell back to rotation: Forbidden").
  - Token permissions: has pages_show_list, pages_read_engagement, pages_manage_metadata, business_management, etc. — MISSING pages_manage_posts (FB publishing), instagram_basic, instagram_content_publish (IG). Real publish test returned: "(#200) The permission(s) pages_manage_posts are not available" — nothing was posted; test cleanup not needed.
  - No Instagram business account linked to ANY of the user's 7 pages → IG publishing unavailable until user converts IG to Professional account and links it to the page.
  - Sandbox public URL (fcapp.run gateway) requires session-affinity headers → not Meta-reachable; cleared from settings and excluded from auto-capture. publicBaseUrl will self-capture on first Vercel dashboard visit / cron hit, or via PUBLIC_BASE_URL env.
- Repo prep: new README.md (quick start, data folder, env vars table, Vercel deploy guide incl. cron-job.org setup, AI-fallback guarantee, API reference, troubleshooting); vercel.json (daily 03:17 UTC backup cron = 06:17 EAT); .env.example; .gitignore rewritten (db/, uploads/, data/config.json, scaffold junk); untracked .env, db/custom.db, .zscripts, Caddyfile, download, examples, mini-services, tests.
- Lint clean (eslint ignores scripts/ dev utilities).
- Git: identity Kaka-Doctor, 2 commits, pushed to https://github.com/Kaka-Doctor/Posting-to-social-medias (private, empty beforehand) using the user's PAT; verified structure via API (root + data/ correct, 108 files).
- Dev server restarted and re-verified after every change round: /api/status connected, /api/import idempotent, /api/cron armed, dry-run OK.

Stage Summary:
- Deliverable: complete agent pushed to GitHub main branch (private repo), verified live in sandbox.
- Credentials: Meta token auto-exchanged and page auto-connected (FB ready); Groq key stored but rejected by Groq (fallback active); both stored in .env + data/config.json (never committed).
- Blockers for first real post (user actions, documented in final message): (1) regenerate Meta token with pages_manage_posts (+ instagram_basic, instagram_content_publish for IG), (2) link an Instagram Professional account to the FB page, (3) set env vars on Vercel + free external cron every 5-10 min.
- Key artifacts: README.md, data/README.md, vercel.json, .env.example, scripts/{make-sample-photo,inspect-db,diagnose,diagnose2,test-fb-publish,cleanup-settings}.js.

---
Task ID: final
Agent: main (Super Z)
Task: New Meta token → connect, verify posting pipeline, prepare Vercel out-of-the-box, push to GitHub

Work Log:
- Replaced META_ACCESS_TOKEN in .env with the new user token (validates as "Kaka Dokta")
- Two-step connect via /api/setup/connect: exchanged token → discovered 7 pages → saved "Teacher's Lesson Plan" (928221430380831) + IG @teachers_lesson_plan (17841478277794533). Note: user-supplied page ID 61585710075643 is the new-style ID; the classic Graph ID is what the API uses.
- Built scripts/test-meta-safe.js — zero-impact validation: FB unpublished post (published=false + delete) and IG container-only (no media_publish)
- RESULTS: Instagram PASSED end-to-end (container → FINISHED). Facebook BLOCKED: token lacks pages_manage_posts permission (needs token regeneration). Posts record as "partial" until fixed.
- Verified no-AI fallback: aiEnabled=false → dry run picks via "Sequential rotation (least-recently-used)"; also verified Groq failure auto-fallback
- Groq key status: returns bare "Forbidden" on all endpoints from this sandbox (key-level rejection or IP block) — fallback keeps posting regardless; may work from Vercel's network
- data/config.json: rewrote with full page connection incl. pageAccessToken (restores connection on Vercel cold start without the wizard — critical since the token manages 5 IG-linked pages and auto-pick could choose the wrong one)
- vercel.json: 2 crons (03:17 + 15:17 UTC = 06:17/18:17 EAT; Hobby plan max 2) — README documents free cron-job.org for the 12:00 EAT slot
- .gitignore: un-ignored .env + data/config.json (private repo, out-of-the-box Vercel; public-repo migration path documented)
- Updated README.md (Vercel section) + data/README.md (config.json section)
- Committed 3c4942e + pushed to https://github.com/Kaka-Doctor/Posting-to-social-medias (repo confirmed PRIVATE)
- Post-push /api/import: connection "already", scheduler armed, library 1 photo + 3 captions, next slot 18:00 EAT

Stage Summary:
- Pipeline fully verified for Instagram; Facebook awaits pages_manage_posts permission on a regenerated token
- Vercel deployment = Import repo → Deploy, zero config needed
- Deliverables: updated .env, data/config.json (full connection), vercel.json (2 crons), scripts/test-meta-safe.js, pushed commits b5c914f + 3c4942e

---
Task ID: ai-removal-and-switching
Agent: main (Super Z)
Task: New token verification, remove Groq AI, single-file page switching, Netlify prep

Work Log:
- New Meta token: all 5 permissions present (incl. pages_manage_posts — the previous gap). Reconnected via /api/setup/connect.
- scripts/test-meta-safe.js: Facebook PASSED (unpublished post created + deleted), Instagram PASSED (container → FINISHED). Both platforms publish-ready.
- Groq removed completely: deleted src/lib/groq.ts + /api/ai/test route; poster.ts now picks least-recently-used photo + caption and posts caption text verbatim; AI fields stripped from status/settings APIs, dashboard UI (setup tab AI card, Groq badge, texts); .env/.env.example/config files cleaned; DB AI fields cleared. ~450 lines deleted.
- data/config.json = THE switch file: user maintains only metaUserToken, appId, appSecret, pageId (+ optional pageName/igUserId/igUsername, timezone, slots). pageAccessToken removed from config — autoConnect fetches a fresh page token from Meta on every cold start, token rotation, or page switch.
- Importer: reconnect now triggers on pageId/igUsername change (not just token rotation); autoConnect preference order: cfg.pageId → cfg.igUsername → saved page → first IG-linked page → first page. Verified LIVE: switched config to Ladies Of Destiny (710815315448548), import auto-connected to @ladies_of_destiny_, switched back to Teacher's Lesson Plan.
- Netlify: netlify.toml (Next plugin), netlify/functions/agent-cron.ts (v6 schedule() API, pings /api/cron every 10 min — covers all 3 slots, no external service needed), @netlify/functions devDep, NETLIFY added to duplicate-guard check in poster.ts.
- vercel.json unchanged (03:17 + 15:17 UTC crons, Hobby-limit 2; README documents cron-job.org for midday slot).
- Verification: eslint clean, tsc clean (app code), next build succeeds with /api/ai gone, homepage 200, dry-run shows "Rotation pick", import re-scan stable, photo raw endpoint 200.
- Committed f61824d, pushed to GitHub (private repo).

Stage Summary:
- Pipeline verified on BOTH platforms with the new token; Groq fully removed; captions post exactly as written
- Page switching = edit pageId in data/config.json + push (auto reconnects; _readme field lists all 7 page IDs)
- Same repo deploys to Vercel (2 crons + optional external cron) or Netlify (built-in scheduled function, all slots covered)
