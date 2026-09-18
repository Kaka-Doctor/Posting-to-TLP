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
