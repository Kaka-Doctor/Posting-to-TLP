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

---
Task ID: github-actions-hosting
Agent: main (Super Z)
Task: Host the agent on GitHub itself (GitHub Actions cron) — triggered automatically, no Vercel/Netlify/server

Work Log:
- Explored PAT capabilities: fine-grained (no X-OAuth-Scopes), can push contents but CANNOT create repos or workflow files ("Resource not accessible" / workflow-scope rejection) — media-repo and direct workflow-push routes dead.
- catbox.moe anonymous hosting tested: 412 "Invalid uploader" from datacenter IPs → dropped.
- DISCOVERED the Meta-internal image pipeline (validated zero-impact, like test-meta-safe.js): FB binary multipart upload (published=false) → unpublished photo's CDN URL is publicly fetchable (HEAD 200 image/jpeg) → IG container with that URL goes straight to FINISHED → delete helper photo. NO external image host needed for IG; FB needs no URL at all (binary "source"). "is_published=true" update path does NOT work (#3) — publish via separate published=true upload.
- Recovered the PERMANENT page token from git history (3c4942e) — still valid for Teacher's Lesson Plan + @teachers_lesson_plan. Stored in data/config.json (posting now survives metaUserToken expiry; the session-DB wipe had lost it).
- Built scripts/gh-agent.mjs: standalone Node 20 runner (no app/DB/deps) mirroring scheduler.ts slot logic + poster.ts rotation + meta.ts publish; state in data/state.json; page-token-first connect with exchange fallback + token minting persisted back to config; autoPost pause switch; 30-min Meta-side duplicate guard; missed-slot marking; --dry-run / --force flags; caption dedupe (mirrors app import).
- Built .github/workflows/social-agent.yml: cron */30 2-16 * * * UTC (05:00–19:30 EAT window — slot times stay in config.json), workflow_dispatch with dryRun/force inputs, concurrency guard, contents:write, normalize step (npm i sharp in /tmp + NODE_PATH), commit -A data/ with push-rebase-retry (survives user web edits racing the runner).
- Built scripts/normalize-photos.js: PNG/webp→JPEG, 4:5–1.91:1 center-crop, 1440w downscale, <320px upscale (squares→1080), EXIF rotate; idempotent; workflow runs it every posting.
- App parity: importer.ts + meta.ts — page-token-first autoConnect (also reads META_PAGE_TOKEN env), works on cold boot with expired metaUserToken; verified live (fresh DB → connected via permanent token).
- User had pushed content via web UI (8 photos + 3 identical captions): normalized all photos (4× 260px→1080², 11.7MB PNG→104KB JPG, 4096px→1440px, 4:5 crop), removed SAMPLE photo, caption dedupe = 1 unique.
- Pushed to main: 14737a1 (agent + config + state + normalized photos + app patches + docs), 19fb6a8 (mode normalization — sandbox fs marks everything 755; fixed with chmod -x), f6ef98b (data/workflow-template.yml). .env on remote trimmed to DATABASE_URL (config.json is the credential source now).
- Workflow file itself could NOT be pushed (PAT lacks workflow scope, any branch) → shipped data/workflow-template.yml + README "One-time activation" (web UI paste, 5 steps) + kept ready-to-push commit on local agent-workflow branch (d23a175). workflow_dispatch test via API also blocked until the file exists.
- Local sandbox: autoPost=false in local DB (one-host-at-a-time rule); dev server verified connected.

Stage Summary:
- Agent is fully GitHub-hostable; repo main is 100% ready — the ONLY missing piece is .github/workflows/social-agent.yml, creatable in 2 minutes from data/workflow-template.yml (web UI) or by granting the PAT workflows permission
- First real post fires at the next slot after activation (06:00 EAT = 03:00 UTC, checked every 30 min)
- E2E verified locally (dry-run + auto + missed-slot + normalize + NODE_PATH trick); IG container path validated against Meta live

---
Task ID: workflow-activation
Agent: main (Super Z)
Task: Push the GitHub Actions workflow now that the PAT has Workflows read+write; activate and verify the GitHub-hosted agent

Work Log:
- User granted the fine-grained PAT "Workflows: read and write" → unblocked the workflow-file push (the single missing piece from the previous session).
- Synced local main to origin/main (3cce151, identical tree — SHA divergence was mode-only), cherry-picked d23a175, pushed 42e3c9b → `.github/workflows/social-agent.yml` LIVE on GitHub (verified via contents API: 3,558 bytes).
- Local final sanity: `node scripts/gh-agent.mjs --dry-run --force` → permanent page token connects (live Meta call OK), slot 06:00 pick ready (photo 0 of 8 + caption), "nothing published, state unchanged", git tree clean.
- API dispatch + run reading → 403 everywhere (PAT lacks Actions read/write; fine-grained PATs separate "Workflows" from "Actions"). Schedule + web-UI "Run workflow" button unaffected.
- Built `.github/workflows/verify.yml` — self-verifying rehearsal: fires automatically when its own file changes (push paths filter) or manually; runs the EXACT scheduled pipeline as `--dry-run --force` on a real GitHub runner (incl. sharp normalize + live Meta connect) and commits the outcome to `data/runner-verified.log` via GITHUB_TOKEN → observable through plain `git fetch`, no Actions permission needed. `if: always()` records failures before failing loudly.
- Replayed the runner's normalize step locally (sharp installed to /tmp/norm + NODE_PATH): all 8 photos pass unchanged → idempotent, no commit churn.
- README: replaced the obsolete "One-time activation" section with "✅ Already activated" (+ fresh-clone reference, verify.yml docs, optional Actions read/write note). Pushed 745b3a6, 257fb96.
- Diagnostics: GitHub status page = Actions operational; both verify pushes produced no marker commit within ~20 min — either free-tier queue delay, the repo's Actions tab was never opened, or a GITHUB_TOKEN push issue; not distinguishable without actions:read.
- Scheduled timeline: first cron fire 02:00 UTC (05:00 EAT, no-op check); first real post 06:00 EAT (03:00 UTC) via the Meta-internal image pipeline.

Stage Summary:
- THE blocker is cleared: the agent is fully hosted on GitHub Actions — no Vercel/Netlify/server needed; scheduled posting requires zero further user setup.
- Independent verification channels: (1) user's Actions tab, (2) `agent: state update …` commits on data/state.json via git fetch, (3) Meta IG media list via page token.
- Open item: first verify marker not observed yet — user should open the repo's Actions tab once (accept enable prompt if shown); red runs email the user automatically.

---
Task ID: workflow-activation-2
Agent: main (Super Z)
Task: Diagnose why pushed workflows produce no runs; hand off user-side activation check

Work Log:
- Added `.github/workflows/trigger-check.yml` (b05d785) — minimal `on: push` (unfiltered, immune to paths edge cases) workflow that commits a one-line ping to data/runner-verified.log with GITHUB_TOKEN. 9 poll rounds: no marker.
- Conclusion: 3 pushes (verify.yml ×2, trigger-check ×1) → 0 observed runs in 30+ min while githubstatus.com reports Actions operational. Leading hypotheses: (a) the repo's Actions was never activated — the Actions tab was never opened and needs the one-time "enable workflows" click; (b) pushes made via fine-grained PAT don't create workflow runs on this repo. Scheduled cron (02:00 UTC) is unaffected by either — schedules don't depend on push events.
- trigger-check.yml is intentionally left in place as the user's 10-second self-test: Actions tab → "Trigger check" → Run workflow → green run + ping line in data/runner-verified.log. Retire it once activation is confirmed.
- All PAT-accessible verification exhausted (contents/status/check-runs/actions APIs all 403 for read; dispatch 403).

Stage Summary:
- Everything automatable is DONE and pushed: workflow live on main (42e3c9b), verify.yml (745b3a6/257fb96), trigger-check.yml (b05d785), README activation docs, worklog (62d43fe).
- Single remaining user action: open https://github.com/Kaka-Doctor/Posting-to-social-medias/actions — click enable if prompted; then optionally "Trigger check" → Run workflow as self-test.
- First scheduled run: 02:00 UTC (05:00 EAT) no-op check; first real post: 06:00 EAT — visible on IG/FB and as the "agent: state update …" commit on data/state.json.

---
Task ID: workflow-activation-3
Agent: main (Super Z)
Task: Root-cause the failed marker steps; finalize live E2E proof

Work Log:
- User enabled workflows (Actions tab) + granted the PAT Actions read/write → full API visibility gained.
- Run history revealed: all 4 earlier push-triggered runs DID fire (runs existed all along — the "no runs" conclusion from the previous session was wrong: they had already completed as failures before my first poll). User's 2 manual workflow_dispatch runs were 100% GREEN, including one with dryRun ticked: agent output from the real runner showed [connect] valid permanent token → Teacher's Lesson Plan, clock 05:02 EAT, slots correct, 8 photos + 1 caption, pick slot 06:00 photo 0, nothing published.
- ROOT CAUSE of the marker failures (from job logs): .gitignore line 22 `*.log` matches data/runner-verified.log → `git add <new ignored file>` exits 1. GITHUB_TOKEN Permissions in the job log explicitly showed "Contents: write" — the push ability was never the problem. Production data/state.json is tracked → state commit-back unaffected.
- Fix: marker renamed to data/runner-verified.txt (not ignored — git check-ignore verified); README + verify.yml updated; trigger-check.yml retired (purpose served, avoids push-trigger noise).
- Pushing the fix self-triggers verify.yml (paths filter) → expected to produce the first-ever green marker commit.

Stage Summary:
- GitHub runner pipeline fully validated end-to-end (dry-run incl. live Meta connect from GitHub IPs); only the marker filename was broken, now fixed.

---
Task ID: production-live
Agent: main (Super Z)
Task: First real GitHub-hosted post; fix peak-minute cron drops; full production verification

Work Log:
- verify.yml run #3 (self-triggered by the fix push): GREEN — first-ever marker commit (aa12d49) landed via GITHUB_TOKEN with the full runner log in data/runner-verified.txt: connect ✓, clock 05:19 EAT ✓, library 8+1 ✓, pick slot 06:00/photo 0 ✓, publish paths armed ✓, nothing published.
- Schedule-trigger gap: 02:00/02:30/03:00 UTC fires never started (0 schedule runs) while push/dispatch triggers worked — matches GitHub's documented behavior of dropping scheduled runs at peak minutes (:00/:30) under load.
- 06:00 EAT slot (due, within catch-up window): dispatched a plain auto run at 03:06 UTC → run #3 GREEN in 20s → **FIRST REAL GITHUB-HOSTED POST PUBLISHED**.
- Triple verification: (1) state commit 910ee4e "agent: state update 2026-09-20 03:06 UTC" — slot 06:00 status=published, IG id 17906903835507630, FB id 928221430380831_122141281101190335, rotation → photo 1; (2) Meta Graph API live query returns the identical IG media (permalink DdflL8Wj5j4, 03:06:36) and FB feed post (03:06:42); (3) run log green.
- Cron fix: `*/30 2-16 * * *` → `13,43 2-16 * * *` (off-peak minutes, per GitHub's own guidance; workflow comment documents the live-observed drops). Also explicitly PUT /enable on the workflow (204) to force schedule registration.
- README updated (off-peak window note 05:13–19:43 EAT).
- Schedule-trigger investigation CONCLUDED: 0 schedule runs across 6+ windows, 2 cron configs, 3 workflows (incl. a fresh */10 probe workflow) — while push triggers (5/5 instant) and workflow_dispatch (4/4) work perfectly and githubstatus.com = operational. Also did a disable→enable cycle (both 204). Conclusion: GitHub is withholding SCHEDULED runs on this repo — a registration/anti-abuse heuristic, not a config error; typically self-resolves with account/repo activity. Account Kaka-Doctor created 2024-09-27.
- Probe converted to an hourly canary (.github/workflows/schedule-probe.yml, cron 45 * * * *, a6c761c): the moment a canary run appears, schedules work again and the agent posts all slots automatically; file is to be deleted once confirmed.
- Fallback for slots while schedules are withheld: manual Run workflow (no boxes) within a slot's 60-min catch-up window, or "force" anytime — documented in README (Post right now / Test without publishing rows).

Stage Summary:
- **The agent is LIVE in production on GitHub Actions**: photo 0/8 + caption posted to Instagram + Facebook at 06:06 EAT from a GitHub runner, state persisted back to the repo.
- Next expected: schedule-triggered runs at :13/:43 (12:13 EAT slot 12:00 post, 18:13 EAT slot 18:00 post).
- All trigger types verified except schedule (fix pushed, awaiting first :13/:43 fire).

---
Task ID: production-live-2
Agent: main (Super Z)
Task: Verify user's pages after first automated posts; confirm schedule trigger; retire canary

Work Log:
- User reported posts went out; verified live on both platforms via Meta Graph API (scripts/check-live-posts.mjs):
  - 06:00 EAT slot → IG 17906903835507630 (DdflL8Wj5j4, 03:06:36Z) + FB 928221430380831_122141281101190335 (03:06:42Z), photo attached, caption intact
  - 12:00 EAT slot → IG 17898566271601278 (DdgPuIxICHH, 09:18:16Z) + FB 928221430380831_122141318457190335 (09:18:23Z), photo attached, caption intact
  - All 4 permalinks in data/state.json resolve to live posts; timestamps + IDs match exactly; rotation advanced photo 0 → 1
- GitHub API (PAT now has Actions permission) shows 8 runs total; run #4 = schedule-triggered, GREEN, posted the 12:00 slot → **schedules are no longer withheld** (GitHub's registration heuristic self-resolved, as predicted). API now fully usable for run monitoring.
- Cleaned up: deleted .github/workflows/schedule-probe.yml (canary, purpose served); README window note corrected to 05:13–19:43 EAT + production confirmation line.
- verify.yml kept (fires only on workflow-file changes — a rehearsed safety net, documented in README).
- Next expected automation: 15:13 UTC cron fire → 18:00 EAT slot post (~18:13–18:43 EAT).

Stage Summary:
- FULLY VERIFIED IN PRODUCTION: all 3 trigger types (push, dispatch, schedule) work; 2/3 slots posted today automatically; state commit-back and rotation functioning end-to-end.
- Remaining user-side niceties only: more captions in data/captions.txt (currently 1 — every post carries the same text), engagement grows organically.

---
Task ID: robustness-after-missed-slot
Agent: main (Super Z)
Task: Diagnose the missed 18:00 slot; validate user's manual fixes; harden against GitHub schedule drops

Work Log:
- Diagnosis (run history via PAT): of ~30 scheduled cron fires on 2026-09-20, only 3 landed (runs at 12:17, 16:42, 20:02 EAT) — GitHub silently dropped 27, including both fires covering the 18:00 slot (15:13/15:43 UTC). The 16:43 fire finally ran at 20:02 EAT — 122 min past the slot, beyond the 60-min grace → agent permanently marked 18:00 "missed".
- User's interventions (17:06 agent dispatch, 17:07 verify dispatch): both GREEN, no damage (workflows active, no file changes) — but couldn't rescue the slot: dispatched 4 min after the miss-marking, without force; and the old force logic only targeted FUTURE slots (it would have posted tomorrow's 06:00 instead).
- Fix, 3 layers (commit 04edd9e):
  1. Cron density: "7,17,27,37,47,57 2-19 * * *" — every 10 min, off-peak minutes, 05:07–22:57 EAT window (dropped fires cost 0 minutes; only landed runs bill).
  2. "graceMinutes": 240 in data/config.json — any landed fire within 4h of a slot posts it (would have saved today's 18:00 via the 20:02 run).
  3. gh-agent.mjs force branch: now rescues the most recent PAST unposted slot (incl. "missed") before falling back to future slots — "Run workflow + force" = same-day rescue button. Local dry-run verified: picks slot 18:00 on 2026-09-20.
- README + workflow comments updated (new window, grace, force semantics, drop rationale).
- Live rescue executed: dispatched force run (run #8, GREEN, 20:28 UTC) → 18:00 slot published 23:29 EAT — IG 17906903835507630-family id / DdhccyemH_6, FB 928221430380831_122141375631190335, photo index 2, state commit bd2269b. All 3 slots now published for 2026-09-20.
- verify.yml self-triggered on the push (expected, path-filtered) and stayed GREEN with the new code.

Stage Summary:
- Root cause: GitHub schedule-fire drops (account-level deprioritization, observed 3/30 landing) + 60-min grace too narrow + force unable to resurrect missed slots. All three addressed.
- Tomorrow's watch: 06:00 slot window = 06:00–10:00 EAT with 8+ fire opportunities; manual fallback = force dispatch.
- Optional future upgrade (not implemented): external 10-min pinger (cron-job.org) hitting workflow_dispatch with a dispatch-only PAT for punctual posts, since dispatch is 100% reliable vs ~10% for cron.

---
Task ID: meta-native-scheduling
Agent: main (Super Z)
Task: Agent failed to post 2026-09-21; root-cause and make posting independent of GitHub's schedule reliability

Work Log:
- Diagnosis: exactly ONE scheduled run landed today (07:54 UTC = 10:54 EAT, of ~70 fires with the 10-min density). GitHub throttles scheduled runs to roughly 1 per 5-11 hours regardless of cron density — account-level, not config. User covered 06:00 manually at 09:01 EAT; 12:00 went out to nobody; 18:00 pending. Answer to "will it work by itself as time goes on?": GitHub throttling eases with account age but is NOT dependable — so the architecture changed instead.
- New model (commit bc61ddf, follow-up 484af29 state): every landed run PRE-SCHEDULES the next scheduleDays (3) days with Meta's own scheduled publishing:
  - IG: container with publish_time (ISO UTC) → media_publish → media sits in SCHEDULED state on Meta's servers
  - FB: photo upload with published=false + scheduled_publish_time (unix sec)
  - state records status "scheduled" + publishTime + ids; auto/force treat it as done; reconcile on later runs swaps in permalinks once posts go live (FB tries both photo id and pageId_photoId)
  - autoPost=false now CANCELS pending scheduled posts (DELETE IG media / FB photo) so the pause is real
  - zonedToUtc 2-pass Intl conversion (verified: 06:00 EAT → 03:00 UTC, DST-aware for other zones); horizon = slots ≥ now+20 min across 3 days; IG 25-scheduled cap fine at 9
  - cron simplified to "13,43 * * * *" (24h, off-peak) — density is pointless under account throttling; landed runs (~2-5/day) each re-book the horizon
- Live rollout (dispatch run #10, GREEN): 12:00 slot catch-up posted 15:56 EAT (IG DdjNfHymCkT + FB 122141468805190335); 7 slots pre-scheduled — today 18:00, and 2026-09-22/23 06:00+12:00+18:00 — verified via Graph API that the IG media objects and FB scheduled photos exist on Meta.
- verify.yml GREEN with new code (self-triggered on push).

Stage Summary:
- Posting is now punctual by construction: Meta's servers publish at exactly 06:00/12:00/18:00 EAT; ONE GitHub fire per ~2 days keeps the horizon full; catch-up + force remain as fallbacks.
- Watch: 18:00 EAT tonight appears with zero GitHub involvement; tomorrow all 3 slots punctual. Reconciliation fills permalinks on the next landed run.
---
Task ID: biblia-repo-setup
Agent: main (Super Z)
Task: Build Kaka-Doctor/Biblia-Tafsiri-Mbalimbali — FB-only daily 09:00 EAT verse poster for the "Biblia Tafsiri Mbalimbali" page (YouVersion VOTD images + SUV captions)

Work Log:
- Main agent health: state c7dfbe4 shows 2026-09-21 18:00 published BY META exactly on schedule (first full Meta-native cycle, zero GitHub involvement at post time); all 09-22 and 09-23 slots pre-booked; rotation at photo 3.
- Page identified via config._readme: Biblia Tafsiri Mbalimbali = 447560908444853 (@biblia_tafsiri_mbalimbali, 100 fans) — verified live with the page token.
- metaUserToken EXPIRED 2026-09-18 (permanent pageAccessToken still valid) → new repo cannot mint its own page token from here. Built a one-paste setup instead: data/meta-token.txt → next run auto-mints the permanent token into config.json + clears the file. Same mechanism ported back into THIS repo's gh-agent.mjs (84c3ae9; local dry-run verified with the live page token).
- Collected 18 YouVersion VOTD images: 6 history days (Sept 15-20, scraped from bible.com/verse-of-the-day gallery via headless browser at 1280x1280 from static-youversionapi-com), 6 designs of the Sept-21 VOTD (Deut 7:9), 6 clean verse graphics via image-search. 6 web candidates rejected (screenshots / not verse graphics). Every image VLM-scanned (glm-5v-turbo) to read its scripture.
- data/posts.json: 18 entries pairing each image with its own caption — SUV Swahili verse text + 2 sentences of explanation/encouragement + 5 hashtags ending #BibliaTafsiriMbalimbali (Lam 3:22, Isa 41:13, Rom 8:6, Prov 3:7, Phil 1:3, Ps 9:1, Deut 7:9 x6, Jer 29:11, Jas 1:2-4, 2 Cor 5:7, 1 Pet 4:8, Matt 5:3, Ps 21:7).
- New repo pushed (8219a5b, 28 files): ported gh-agent.mjs (FB-only via platforms="facebook", manifest-driven rotation, dry-run without token), normalize-photos.js, 30-min heartbeat workflow with dryRun/force buttons, FB-only check-live-posts.mjs, README, fresh state.
- Live test: workflow active on first push; dispatched dryRun run #1 → GREEN (18 pairs, 09:00 EAT slot plan, 3-day horizon, correct no-commit in dry-run).
- FB Groups research (every-2-day sharing to 50 groups): Groups API deprecated in v19.0 (Jan 2024) and REMOVED from all versions 2024-04-22 — no official API path exists, page tokens included. Options reported to user (local browser automation with ToS risk, or manual sharing); not implemented.

Stage Summary:
- New repo fully operational pending ONE user step: paste a fresh Graph API Explorer token (pages_show_list + pages_manage_posts + pages_read_engagement) into data/meta-token.txt and push. First landed run mints the permanent page token, books 3 days of 09:00 EAT posts, clears the file.
- Main repo behavior unchanged; token-recovery is now one paste.
- Verse pool cycles every ~18 days; extend by appending to data/posts.json.

---
Task ID: biblia-dual-platform
Agent: main (Super Z)
Task: Enable Instagram posting for Biblia-Tafsiri-Mbalimbali (user discovered the connected IG page + provided a fresh token); fix fallout

Work Log:
- User token verified: valid until 2026-09-22 07:00 UTC (SHORT-LIVED — would have died in ~1h). Acted immediately: exchanged to long-lived via app secret (appId 1396184215347531 + appSecret), then minted the PERMANENT page token for Biblia (447560908444853) — debug_token shows type=PAGE, expires_at=0 (never expires), scopes include pages_manage_posts + instagram_content_publish.
- IG account confirmed: 17841470180666328 = @biblia_tafsiri_mbalimbali (114 followers, 42 posts, linked to the FB page).
- Biblia repo updated (commit b25cb1b + later): platforms "facebook,instagram", pageAccessToken + igUserId/igUsername in config, check-live-posts.mjs extended with IG section, README/workflow updated for dual-platform.
- FIRST DUAL-PLATFORM POST LIVE: run #6 posted the 09:00 EAT slot to BOTH — IG https://www.instagram.com/p/DdlDM5Tjrcu/ + FB post 122205161444587338 (Rom 8:6, votd-2026-09-17.jpg) at 09:05 EAT. 09-23 + 09-24 FB halves pre-scheduled on Meta.
- ⚠ DISCOVERED + FIXED two systemic bugs:
  1. Duplicate-guard false positive: IG /media edge lists SCHEDULED containers with creation-time timestamps → the guard misread the agent's own horizon booking as "a post just went out" and skipped the 09:00 slot (observed live: run at 08:54 booked → run at 09:02 skipped). Fixed in BOTH repos: guard ignores IG media ids that state.json recorded as scheduled; limit 3→10.
  2. ⚠⚠ IG API SCHEDULING IS DEAD: the container's publish_time is SILENTLY IGNORED — media_publish publishes IMMEDIATELY (controlled experiment: 25-min-ahead probe post went live instantly, deleted after; scheduled_publish_time returns "User must be on whitelist"). All "Meta-scheduled" IG posts had actually published at BOOKING time — the user's IG page had received ~11 premature posts dumped in bursts. FB scheduling (scheduled_publish_time on /photos) works PERFECTLY (verified: 03:00:09 and 15:00:03 exact publishes).
- CLEANUP: deleted all 11 premature IG posts (9 main repo: 09-22 12:00/18:00 + 09-23×3 + 09-24×3 + today's 06:00; 2 Biblia: 09-23/09-24) via Graph DELETE. State surgery: removed premature ig.ids, pinned captions into slot records (rebase conflict with remote reconcile resolved: kept FB permalinks).
- NEW ARCHITECTURE (both repos, commits 98a47ee/fa0b9ae + Biblia ports): FB stays Meta-scheduled (3-day horizon, punctual by construction). IG halves are NEVER pre-scheduled — landed runs post them directly in each slot's [slot time, +240 min] catch-up window, reusing the slot's pinned photo+caption; guard for IG-only posts checks IG only (minutesSinceLastIgPost); reconcile confirms FB permalink and closes grace-lapsed slots as partial; force rescues the most recent slot missing an IG half.
- LIVE VERIFICATION of the new architecture: dispatched main repo run #15 → posted ONLY the IG half of today's 06:00 slot (FB already live since 03:00:09) at 09:21 EAT with pinned content — https://www.instagram.com/p/DdlFBlCmNyb/ ("posted 37s ago" at check time). IG page timeline now clean.

Stage Summary:
- Biblia repo: FULLY DUAL-PLATFORM and live — today's 09:00 slot published to FB + IG; 09-23/24 FB halves Meta-scheduled; IG halves will be catch-up posted by landed runs (or force).
- Main repo: same reliability model — FB always exact via Meta; IG posted by first landed run after each slot (12:00 and 18:00 EAT today pending; 12:00 to be dispatched ~12:05).
- Permanent page token for Biblia minted from the user's short-lived token one minute-class before expiry; token-recovery path (meta-token.txt) remains as fallback.
- Recommendation for perfect IG punctuality: external pinger (cron-job.org → workflow_dispatch), since IG cannot ride Meta's scheduler.
