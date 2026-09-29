#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Social Media Auto-Posting Agent — standalone GitHub Actions runner
 * ─────────────────────────────────────────────────────────────────────────────
 *  Runs on GitHub's servers (`.github/workflows/social-agent.yml`), triggered
 *  by GitHub's cron. No web server, no database, no external image host, no
 *  npm installs — plain Node (>= 18) reading the repo itself.
 *
 *  RELIABILITY MODEL: GitHub silently drops most scheduled runs on young
 *  accounts (observed live: 1 run per 5-11 hours, regardless of cron density).
 *  The agent therefore does NOT rely on firing at slot time. Every landed run
 *  PRE-SCHEDULES the next `scheduleDays` days of slots with Meta's own
 *  scheduled publishing (FB photos with scheduled_publish_time) — Meta then
 *  publishes each FB post exactly at its slot time. One landed run every ~2
 *  days is enough. The IG half of each slot is posted by the first landed run
 *  SHORTLY AFTER slot time (the workflow's 06:03 EAT punctuality fire → IG at
 *  ~06:04-06:07), with retries bounded to a catch-up window sized so it
 *  CONTAINS the reliable morning landing cluster (graceMinutes 420 =
 *  06:00–13:00 EAT, ending 10:00 UTC — the same window-END time Biblia
 *  Tafsiri Mbalimbali reliably posts within every single day. The 06:00 EAT
 *  slot is the EARLIEST of the three pages and GitHub drops most
 *  03:00–07:00 UTC fires, so a 240-min window closed 30 min BEFORE the
 *  07:30–09:45 UTC cluster — that was the recurring "FB only" bug, observed
 *  live 2026-09-29; owner rule 2026-09-23 "not at any moment of the same
 *  day" still holds — the window is hard-bounded, same-day, morning).
 *  Past the window the day's IG half is SKIPPED (slot closes 'partial'; the
 *  sibling pages force-rescue it the same afternoon via mutual rescue
 *  condition (c), or the force button posts just the IG half manually) — IG
 *  never posts at arbitrary times of day. A failed IG attempt never closes a slot
 *  (later landed runs retry it inside the window); before retrying, the live
 *  IG feed is scanned for this slot's caption (phantom publish) and for
 *  unknown external posts (the owner's Mon/Wed/Fri 09:00 EAT poster) — both
 *  are adopted instead of double-posted.
 *
 *  MUTUAL RESCUE (owner rule 2026-09-24, "post like Biblia Tafsiri
 *  Mbalimbali"): every landed run also checks the sibling pages ("siblings"
 *  in data/config.json) through the GitHub API and dispatches a sibling's
 *  workflow when that sibling has an IG half due but no landed run of its
 *  own — API workflow_dispatches are 100% reliable, unlike cron schedules.
 *  v2 (2026-09-29) adds condition (c): a sibling whose TODAY slot already
 *  closed 'partial'/'missed' with the IG half missing gets a FORCE dispatch
 *  (cutoff: slot + grace + 120 min, same afternoon) — the sibling's force
 *  path posts just the missing IG half, so a lapsed window no longer strands
 *  the day (that was the 2026-09-29 TLP failure). Needs the dispatch token
 *  (data/config.json "dispatchToken", fine-grained PAT
 *  with contents:read + actions:write on the sibling repos; a DISPATCH_TOKEN
 *  repo secret would override it). A dispatched run (input rescuedBy)
 *  skips its own sibling check — one hop, no ping-pong.
 *
 *  Everything configurable lives in data/config.json (the switch file):
 *    pageId / igUserId  → which page/account to post to
 *    slots / timezone   → when to post (cron here just checks often)
 *    pageAccessToken    → permanent page token (preferred)
 *    metaUserToken      → user token, used to re-derive a page token if the
 *                         permanent one ever stops working (rotation path)
 *
 *  Image pipeline (fully Meta-internal, no public hosting needed):
 *    Instagram requires a public image_url. We upload the photo to the FB page
 *    as an UNPUBLISHED photo (binary upload, invisible), take its public CDN
 *    URL, feed that to the IG container, publish on IG, then delete the hidden
 *    photo. Facebook itself is posted via direct binary upload.
 *
 *  State lives in data/state.json and is committed back to the repo by the
 *  workflow (which slots are done per day + rotation counters + event log).
 *
 *  Flags:  --dry-run   pick content, print the plan, publish nothing
 *          --force     post the next scheduled slot right now (manual runs)
 *  Exit:   0 = ok / nothing to do, 1 = failure (red run in the Actions tab)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_FILE = path.join(ROOT, 'data', 'config.json')
const STATE_FILE = path.join(ROOT, 'data', 'state.json')
const PHOTOS_DIR = path.join(ROOT, 'data', 'photos')
const CAPTIONS_FILE = path.join(ROOT, 'data', 'captions.txt')
const TOKEN_FILE = path.join(ROOT, 'data', 'meta-token.txt')

const GRAPH = 'https://graph.facebook.com/v21.0'

const ARG_DRY = process.argv.includes('--dry-run')
const ARG_FORCE = process.argv.includes('--force')

const log = (msg) => console.log(msg)

// ── Graph API helpers (mirrors src/lib/meta.ts) ─────────────────────────────
async function graphGet(pathname, params) {
  const url = new URL(`${GRAPH}/${pathname}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  return json
}

async function graphPost(pathname, params) {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) body.set(k, String(v))
  const res = await fetch(`${GRAPH}/${pathname}`, { method: 'POST', body })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  return json
}

async function graphDelete(pathname, params) {
  const url = new URL(`${GRAPH}/${pathname}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url, { method: 'DELETE' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  return json
}

/** POST /{page}/photos with a binary file (multipart "source" field) */
async function fbUploadPhoto(pageId, pageToken, filePath, { caption = '', published = true } = {}) {
  const buf = await fs.readFile(filePath)
  const form = new FormData()
  if (caption) form.append('caption', caption)
  form.append('published', published ? 'true' : 'false')
  form.append('access_token', pageToken)
  form.append('source', new Blob([buf], { type: 'image/jpeg' }), path.basename(filePath))
  const res = await fetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  return json
}

// ── Connect (page-token first, user-token exchange as fallback) ─────────────
async function connect(cfg) {
  // 1) permanent page token from config
  if (cfg.pageAccessToken && cfg.pageId) {
    try {
      const me = await graphGet(cfg.pageId, {
        fields: 'name,instagram_business_account{id,username}',
        access_token: cfg.pageAccessToken,
      })
      const ig = me.instagram_business_account ?? {}
      log(`[connect] page token (permanent): valid → ${me.name} | IG: @${ig.username ?? 'none'}`)
      return {
        via: 'page-token',
        page: {
          pageId: cfg.pageId,
          pageName: String(me.name ?? ''),
          pageToken: cfg.pageAccessToken,
          igUserId: String(ig.id ?? cfg.igUserId ?? ''),
          igUsername: String(ig.username ?? ''),
        },
      }
    } catch (e) {
      log(`[connect] permanent page token failed (${e.message}) — trying user-token exchange`)
    }
  }
  // 2) rotation path: exchange user token → pages → page token.
  //    The user token may also live in data/meta-token.txt (paste-and-push,
  //    no JSON editing); the file is cleared after the permanent page token
  //    is minted and saved to data/config.json.
  let token = String(cfg.metaUserToken || '').trim()
  let tokenFromFile = false
  if (!token) {
    token = (await fs.readFile(TOKEN_FILE, 'utf-8').catch(() => '')).trim()
    if (token) {
      tokenFromFile = true
      log('[connect] found user token in data/meta-token.txt — minting the permanent page token')
    }
  }
  if (!token) {
    throw new Error('No working token: pageAccessToken invalid and metaUserToken missing/expired — generate a fresh Graph API Explorer token and paste it into data/meta-token.txt (plain text, one line) and push; the agent mints the permanent page token on its next run')
  }
  if (cfg.appId && cfg.appSecret) {
    try {
      const ex = await graphGet('oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: cfg.appId,
        client_secret: cfg.appSecret,
        fb_exchange_token: token,
      })
      if (ex.access_token) token = String(ex.access_token)
    } catch { /* keep raw token */ }
  }
  try {
    const pages = await graphGet('me/accounts', {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      access_token: token,
      limit: '50',
    })
    const list = (pages.data ?? []).map((p) => ({
      id: String(p.id),
      name: String(p.name),
      accessToken: String(p.access_token),
      igUserId: p.instagram_business_account ? String(p.instagram_business_account.id) : '',
      igUsername: p.instagram_business_account ? String(p.instagram_business_account.username) : '',
    }))
    const page =
      list.find((p) => cfg.pageId && p.id === cfg.pageId) ??
      list.find((p) => cfg.igUsername && p.igUsername === cfg.igUsername) ??
      list.find((p) => p.igUserId) ??
      list[0]
    if (!page) throw new Error('Token exchange OK but no pages visible to this token')
    log(`[connect] user-token path → ${page.name} (${page.id}) | IG: @${page.igUsername}`)
    return { via: 'exchange', tokenFromFile, userToken: true, sourceToken: token, page: { ...page, pageToken: page.accessToken } }
  } catch (e) {
    // 3) a pasted token might already BE a page token (not a user token)
    if (cfg.pageId) {
      const me = await graphGet(cfg.pageId, { fields: 'name,instagram_business_account{id,username}', access_token: token }).catch(() => null)
      if (me && me.name) {
        const ig = me.instagram_business_account ?? {}
        log(`[connect] token works directly as the page token → ${me.name} | IG: @${ig.username ?? 'none'}`)
        return {
          via: 'exchange',
          tokenFromFile,
          userToken: false,
          sourceToken: token,
          page: { id: cfg.pageId, name: String(me.name), igUserId: String(ig.id ?? ''), igUsername: String(ig.username ?? ''), pageToken: token },
        }
      }
    }
    throw new Error(`${e.message} — and the token does not work as a page token either. Generate a fresh token in the Graph API Explorer (pages_show_list + pages_manage_posts + pages_read_engagement) and paste it into data/meta-token.txt`)
  }
}

// ── Time / slots (mirrors src/lib/settings.ts + scheduler.ts) ───────────────
function localNow(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '0'
  const hour = Number(get('hour')) % 24
  const minute = Number(get('minute'))
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutesOfDay: hour * 60 + minute,
  }
}

function parseSlots(str) {
  return String(str || '06:00,12:00,18:00')
    .split(',')
    .map((s) => s.trim().match(/^(\d{1,2}):(\d{2})$/))
    .filter(Boolean)
    .map((m) => ({
      minutes: Number(m[1]) * 60 + Number(m[2]),
      label: `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`,
    }))
    .sort((a, b) => a.minutes - b.minutes)
}

// ── Content: photos + captions (mirrors src/lib/importer.ts parsing) ────────
async function loadLibrary() {
  const photos = (await fs.readdir(PHOTOS_DIR))
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort()
  const nonJpg = (await fs.readdir(PHOTOS_DIR)).filter((f) => /\.(png|webp)$/i.test(f))
  if (nonJpg.length > 0) {
    log(`[library] note: ${nonJpg.length} non-JPEG file(s) present (${nonJpg.join(', ')}) — the workflow's normalize step converts them to JPEG; IG can only post JPEG`)
  }
  const captions = Array.from(
    new Set(
      (await fs.readFile(CAPTIONS_FILE, 'utf-8'))
        .split(/\n\s*---+\s*\n/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && t.length <= 2200)
    )
  )
  return { photos, captions }
}

// ── State (data/state.json, committed back by the workflow) ─────────────────
const EMPTY_STATE = { version: 1, days: {}, rotation: { photoIndex: 0, captionIndex: 0 }, events: [] }
async function readState() {
  try {
    const s = JSON.parse(await fs.readFile(STATE_FILE, 'utf-8'))
    return { ...EMPTY_STATE, ...s, rotation: { ...EMPTY_STATE.rotation, ...(s.rotation ?? {}) } }
  } catch {
    return JSON.parse(JSON.stringify(EMPTY_STATE))
  }
}
async function writeState(state) {
  state.events = state.events.slice(-100)
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n')
}
function recordEvent(state, ev) {
  state.events.push({ ts: new Date().toISOString(), ...ev })
}

// ── Duplicate guard (mirrors src/lib/meta.ts minutesSinceLastPost) ──────────
// ⚠ IG /media lists SCHEDULED-but-unpublished containers too, with timestamp =
// CREATION time — the guard would misread our own horizon booking as "a post
// just went out" and skip the current slot (observed live on the Biblia repo
// 2026-09-22). Fix: ignore IG media ids that state.json itself recorded as
// scheduled.
async function minutesSinceLastPost(page, state) {
  const cutoff = Date.now() - 7 * 86400000
  const future = Date.now() + 60000 // ignore future timestamps (scheduled posts)
  const scheduledIgIds = new Set()
  for (const day of Object.values(state?.days ?? {})) {
    for (const rec of Object.values(day ?? {})) {
      if (rec?.status === 'scheduled' && rec?.ig?.id) scheduledIgIds.add(String(rec.ig.id))
    }
  }
  try {
    if (page.igUserId) {
      const json = await graphGet(`${page.igUserId}/media`, { fields: 'id,timestamp', limit: '10', access_token: page.pageToken })
      const ts = (json.data ?? [])
        .filter((m) => !scheduledIgIds.has(String(m.id)))
        .map((m) => (m.timestamp ? new Date(m.timestamp).getTime() : 0)).filter(Boolean).filter((t) => t < future)
      const latest = Math.max(...ts, 0)
      if (latest > cutoff) return Math.max(0, Math.round((Date.now() - latest) / 60000))
      return null
    }
  } catch { /* fall through */ }
  try {
    const json = await graphGet(`${page.pageId}/posts`, { fields: 'created_time', limit: '3', access_token: page.pageToken })
    const ts = (json.data ?? []).map((p) => (p.created_time ? new Date(p.created_time).getTime() : 0)).filter(Boolean).filter((t) => t < future)
    const latest = Math.max(...ts, 0)
    if (latest > cutoff) return Math.max(0, Math.round((Date.now() - latest) / 60000))
  } catch { /* unknown — do not block */ }
  return null
}

/** IG-only guard variant: used when posting ONLY the Instagram half of a
 *  Meta-scheduled slot. The FB twin publishes at slot time via Meta and would
 *  false-positive a whole-page guard check — so only IG's own recent posts
 *  count here. State-recorded IG ids are excluded (already accounted slots). */
async function minutesSinceLastIgPost(page, state) {
  const cutoff = Date.now() - 7 * 86400000
  const future = Date.now() + 60000
  const knownIgIds = new Set()
  for (const day of Object.values(state?.days ?? {})) {
    for (const rec of Object.values(day ?? {})) {
      if (rec?.ig?.id) knownIgIds.add(String(rec.ig.id))
    }
  }
  try {
    const json = await graphGet(`${page.igUserId}/media`, { fields: 'id,timestamp', limit: '10', access_token: page.pageToken })
    const ts = (json.data ?? [])
      .filter((m) => !knownIgIds.has(String(m.id)))
      .map((m) => (m.timestamp ? new Date(m.timestamp).getTime() : 0)).filter(Boolean).filter((t) => t < future)
    const latest = Math.max(...ts, 0)
    if (latest > cutoff) return Math.max(0, Math.round((Date.now() - latest) / 60000))
  } catch { /* unknown — do not block */ }
  return null
}

/** Detect an IG post the state does NOT know about, newer than `sinceMs`.
 *  WHY: the owner has an EXTERNAL poster (observed live 2026-09-23; fires
 *  Mon/Wed/Fri ~09:00 EAT = 06:00 UTC, posts an FB+IG pair with repo content
 *  but WITHOUT the Graph API — no app attribution — likely a phone automation
 *  or an old scheduling tool). When such a post covers a slot's IG half, the
 *  agent ADOPTS it instead of double-posting. Returns the newest unknown
 *  post in [sinceMs, now] or null. */
async function findExternalIgPost(page, state, sinceMs) {
  if (!page.igUserId) return null
  const knownIgIds = new Set()
  for (const day of Object.values(state?.days ?? {})) {
    for (const rec of Object.values(day ?? {})) {
      if (rec?.ig?.id) knownIgIds.add(String(rec.ig.id))
    }
  }
  try {
    const json = await graphGet(`${page.igUserId}/media`, { fields: 'id,timestamp,permalink', limit: '10', access_token: page.pageToken })
    const candidates = (json.data ?? [])
      .filter((m) => !knownIgIds.has(String(m.id)) && m.timestamp)
      .map((m) => ({ id: String(m.id), permalink: m.permalink ? String(m.permalink) : '', ts: new Date(m.timestamp).getTime() }))
      .filter((m) => m.ts >= sinceMs && m.ts <= Date.now() + 60000)
      .sort((a, b) => b.ts - a.ts)
    return candidates[0] ?? null
  } catch { /* IG edge unreadable — treat as no external post */ }
  return null
}

/** Robustness (owner rule 2026-09-23: "if it's time for posting it must post
 *  to both fb and IG"): look for THIS slot's caption already live on the IG
 *  feed before (re)publishing the IG half. Covers a media_publish timeout
 *  that actually succeeded server-side (phantom post — a blind retry would
 *  DOUBLE-post) and a manual post of the same content. TLP captions share a
 *  fixed header, so a prefix match is NOT safe here — the match is on the
 *  FULL caption text (IG stores the first 2200 chars). Only media newer than
 *  sinceMs is considered. Returns { id, permalink } or null. */
async function findMatchingIgPost(page, caption, sinceMs) {
  if (!page.igUserId) return null
  const key = String(caption ?? '').slice(0, 2200).trim()
  if (!key) return null
  try {
    const json = await graphGet(`${page.igUserId}/media`, { fields: 'id,timestamp,caption,permalink', limit: '10', access_token: page.pageToken })
    for (const m of json.data ?? []) {
      const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0
      if (sinceMs && ts && ts < sinceMs) continue
      if (String(m.caption ?? '').trim() === key) {
        return { id: String(m.id), permalink: String(m.permalink ?? '') }
      }
    }
  } catch { /* unknown — do not block */ }
  return null
}

// ── Publish (IG via Meta CDN, FB via binary upload) ─────────────────────────
async function publishInstagram(page, photoPath, caption) {
  const steps = []
  let helperPhotoId = ''
  try {
    // 1) hidden FB photo → public CDN URL
    const up = await fbUploadPhoto(page.pageId, page.pageToken, photoPath, { published: false })
    helperPhotoId = String(up.id ?? '')
    steps.push(`helper photo ${helperPhotoId} uploaded (unpublished)`)
    const info = await graphGet(helperPhotoId, { fields: 'images', access_token: page.pageToken })
    const images = (info.images ?? []).slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
    const cdnUrl = String(images[0]?.source ?? '')
    if (!cdnUrl) throw new Error('no CDN URL on the helper photo')
    steps.push(`CDN url ok (${images[0].width}px)`)

    // 2) IG container → poll → publish (mirrors src/lib/meta.ts)
    const container = await graphPost(`${page.igUserId}/media`, {
      image_url: cdnUrl,
      caption: caption.slice(0, 2200),
      access_token: page.pageToken,
    })
    const creationId = String(container.id ?? '')
    if (!creationId) throw new Error('no container id returned')
    steps.push(`container ${creationId}`)
    let ready = false
    for (let i = 0; i < 10; i++) {
      const status = await graphGet(creationId, { fields: 'status_code', access_token: page.pageToken })
      const code = String(status.status_code ?? '')
      if (code === 'FINISHED') { ready = true; break }
      if (code === 'ERROR') throw new Error('Instagram could not process the image')
      await new Promise((r) => setTimeout(r, 2000))
    }
    if (!ready) throw new Error('image processing timed out (try a smaller JPEG)')
    steps.push('container FINISHED')

    const published = await graphPost(`${page.igUserId}/media_publish`, { creation_id: creationId, access_token: page.pageToken })
    const postId = String(published.id ?? '')
    let permalink = ''
    try {
      const info2 = await graphGet(postId, { fields: 'permalink', access_token: page.pageToken })
      permalink = String(info2.permalink ?? '')
    } catch { /* best-effort */ }
    steps.push(`published ${postId}`)
    return { ok: true, postId, permalink, error: '', steps }
  } catch (e) {
    return { ok: false, postId: '', permalink: '', error: e.message, steps }
  } finally {
    if (helperPhotoId) {
      try { await graphDelete(helperPhotoId, { access_token: page.pageToken }) } catch { /* best-effort cleanup */ }
    }
  }
}

async function publishFacebook(page, photoPath, caption) {
  try {
    const json = await fbUploadPhoto(page.pageId, page.pageToken, photoPath, {
      caption: caption.slice(0, 5000),
      published: true,
    })
    const postId = String(json.post_id ?? json.id ?? '')
    let permalink = ''
    try {
      const info = await graphGet(postId, { fields: 'permalink_url', access_token: page.pageToken })
      permalink = String(info.permalink_url ?? '')
    } catch { /* best-effort */ }
    return { ok: true, postId, permalink, error: '' }
  } catch (e) {
    return { ok: false, postId: '', permalink: '', error: e.message }
  }
}

// ── Meta-scheduled publishing (the reliability core) ────────────────────────
// FB ONLY: photo upload with published=false + scheduled_publish_time — Meta
// publishes exactly on time; GitHub's schedule drops become irrelevant for FB.
// IG has NO API scheduling (publish_time is ignored — see note below), so IG
// halves are posted directly by landed runs in each slot's catch-up window.

// ⚠ IG API scheduling is DEAD (verified live 2026-09-22 with a controlled
// experiment): the container's publish_time is SILENTLY IGNORED — media_publish
// publishes IMMEDIATELY (a 25-min-ahead probe post went live instantly), and
// scheduled_publish_time returns "User must be on whitelist" (removed API).
// So IG posts are NEVER pre-scheduled. Instead, landed runs post IG directly
// in each slot's catch-up window (see the IG-catch-up logic in main()).
// Facebook scheduling (scheduled_publish_time on /photos) works perfectly and
// remains the reliability core for FB.

async function scheduleFacebookPost(page, photoPath, caption, publishTimeUnixSec) {
  try {
    const buf = await fs.readFile(photoPath)
    const form = new FormData()
    if (caption) form.append('caption', caption.slice(0, 5000))
    form.append('published', 'false')
    form.append('scheduled_publish_time', String(publishTimeUnixSec))
    form.append('access_token', page.pageToken)
    form.append('source', new Blob([buf], { type: 'image/jpeg' }), path.basename(photoPath))
    const res = await fetch(`${GRAPH}/${page.pageId}/photos`, { method: 'POST', body: form })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
    return { ok: true, postId: String(json.id ?? ''), error: '' }
  } catch (e) {
    return { ok: false, postId: '', error: e.message }
  }
}

/** Confirm Meta-scheduled FB posts that went live → record permalinks.
 *  IG is never pre-scheduled (API dead), so a scheduled slot's IG half is
 *  completed by the catch-up logic in main(); reconcile only (a) fills the FB
 *  permalink once Meta flips the scheduled photo to a live feed post, and
 *  (b) closes slots as 'partial' (FB-only) when the IG catch-up window lapsed
 *  without a landed run. */
async function reconcileScheduled(page, state, graceMinutes) {
  let changed = false
  for (const [dk, day] of Object.entries(state.days ?? {})) {
    for (const [label, rec] of Object.entries(day ?? {})) {
      if (rec?.status !== 'scheduled' || !rec.publishTime) continue
      const due = new Date(rec.publishTime).getTime()
      if (Date.now() < due + 5 * 60000) continue // not due yet
      // (a) FB confirmation: scheduled photo flips to a feed post with a permalink
      if (rec.fb?.id && !rec.fb.permalink) {
        for (const cid of [String(rec.fb.id), `${page.pageId}_${String(rec.fb.id)}`]) {
          try {
            const p = await graphGet(cid, { fields: 'permalink_url,created_time', access_token: page.pageToken })
            if (p.permalink_url && p.created_time && new Date(p.created_time).getTime() <= Date.now() + 60000) {
              rec.fb = { id: cid, permalink: String(p.permalink_url) }
              changed = true
              break
            }
          } catch { /* not confirmable via this id yet */ }
        }
      }
      const igDone = Boolean(rec.ig?.id)
      if (igDone) {
        rec.status = 'published'
        rec.at = rec.publishTime
        recordEvent(state, { level: 'success', date: dk, slot: label, message: `${label} completed — FB (Meta) + IG (catch-up) both live` })
        changed = true
      } else {
        // Adopt an EXTERNAL IG post (owner's Mon/Wed/Fri 09:00 EAT poster etc.)
        // that appeared since this slot became due — instead of double-posting
        // or later declaring the slot partial when IG is actually live.
        const ext = await findExternalIgPost(page, state, due - 10 * 60000)
        if (ext) {
          rec.ig = { id: ext.id, permalink: ext.permalink, external: true }
          rec.status = 'published'
          rec.at = new Date(ext.ts).toISOString()
          recordEvent(state, { level: 'info', date: dk, slot: label, message: `${label} IG half covered by an EXTERNAL post (${ext.permalink || ext.id}) — adopted instead of double-posting` })
          changed = true
        } else if (Date.now() > due + graceMinutes * 60000) {
          rec.status = 'partial'
          rec.at = rec.publishTime
          recordEvent(state, { level: 'error', date: dk, slot: label, message: `${label} partial — FB published by Meta on time, but no landed run caught up the IG half within ${graceMinutes} min` })
          changed = true
        }
      }
    }
  }
  return changed
}

/** Pause switch: delete pending scheduled posts from Meta so "autoPost": false really stops everything. */
async function cancelPendingScheduled(page, state) {
  let cancelled = 0
  for (const [dk, day] of Object.entries(state.days ?? {})) {
    for (const [label, rec] of Object.entries(day ?? {})) {
      if (rec?.status !== 'scheduled' || !rec.publishTime) continue
      if (new Date(rec.publishTime).getTime() < Date.now()) continue
      const removed = []
      if (rec.ig?.id) { try { await graphDelete(String(rec.ig.id), { access_token: page.pageToken }); removed.push('IG') } catch { /* already gone */ } }
      if (rec.fb?.id) { try { await graphDelete(String(rec.fb.id), { access_token: page.pageToken }); removed.push('FB') } catch { /* already gone */ } }
      if (removed.length > 0) {
        rec.status = 'cancelled'
        rec.at = new Date().toISOString()
        recordEvent(state, { level: 'info', date: dk, slot: label, message: `${label} cancelled (autoPost=false) — removed from Meta: ${removed.join(' + ')}` })
        cancelled++
      }
    }
  }
  return cancelled
}

/** Wall-clock (dateKey + minutesOfDay) in `timeZone` → UTC epoch ms. 2-pass Intl convergence. */
function zonedToUtc(dateKey, minutesOfDay, timeZone) {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const wallMs = Date.UTC(y, mo - 1, d, Math.floor(minutesOfDay / 60), minutesOfDay % 60)
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  let ts = wallMs
  for (let i = 0; i < 3; i++) {
    const parts = fmt.formatToParts(new Date(ts))
    const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0)
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
    if (asUTC === wallMs) break
    ts += wallMs - asUTC
  }
  return ts
}

/** Upcoming slots across `scheduleDays` days that have no state entry yet. */
function buildHorizon(state, slots, now, tz, scheduleDays) {
  const plan = []
  const minUnix = Date.now() + 20 * 60000 // Meta needs ≥ 10 min lead; use 20 for safety
  for (let d = 0; d < scheduleDays; d++) {
    const dk = d === 0 ? now.date : addDaysKey(now.date, d)
    for (const s of slots) {
      if (state.days[dk]?.[s.label]) continue
      const slotUnix = zonedToUtc(dk, s.minutes, tz)
      if (slotUnix < minUnix) continue
      plan.push({ dk, slot: s, slotUnix })
    }
  }
  return plan
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const cfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf-8'))
  const { page, via, tokenFromFile, userToken, sourceToken } = await connect(cfg)

  // If we had to mint a page token through the user-token path, persist it
  // back into data/config.json — future runs (and page switches) then work
  // from the permanent token without needing a fresh user token. A pasted
  // data/meta-token.txt is cleared after use (kept in metaUserToken as the
  // fallback rotation source if it was a real user token).
  if (via === 'exchange') {
    let changed = false
    if (cfg.pageAccessToken !== page.pageToken) { cfg.pageAccessToken = page.pageToken; changed = true }
    if (cfg.pageName !== page.name) { cfg.pageName = page.name; changed = true }
    if (cfg.igUserId !== page.igUserId) { cfg.igUserId = page.igUserId; changed = true }
    if (cfg.igUsername !== page.igUsername) { cfg.igUsername = page.igUsername; changed = true }
    if (userToken && sourceToken && cfg.metaUserToken !== sourceToken) { cfg.metaUserToken = sourceToken; changed = true }
    if (tokenFromFile) {
      await fs.writeFile(TOKEN_FILE, '')
      log('[connect] data/meta-token.txt cleared (permanent page token saved to data/config.json)')
      changed = true
    }
    if (changed) {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n')
      log('[connect] minted page token saved → data/config.json (committed with the state)')
    }
  }

  const state = await readState()
  const tz = cfg.timezone || 'Africa/Dar_es_Salaam'
  const slots = parseSlots(cfg.slots)
  const grace = Number(cfg.graceMinutes ?? 60)
  const scheduleDays = Math.max(1, Math.min(7, Number(cfg.scheduleDays ?? 3)))
  const now = localNow(tz)
  const nowClock = `${String(Math.floor(now.minutesOfDay / 60)).padStart(2, '0')}:${String(now.minutesOfDay % 60).padStart(2, '0')}`

  log(`[clock] ${now.date} ${nowClock} (${tz}) | slots: ${slots.map((s) => s.label).join(', ')} | grace ${grace}m | horizon ${scheduleDays}d | mode: ${ARG_DRY ? 'DRY-RUN' : ARG_FORCE ? 'FORCED' : 'auto'}`)

  // Emergency pause switch — set "autoPost": false in data/config.json.
  // Pending Meta-scheduled posts are deleted so the pause really stops everything.
  if (cfg.autoPost === false && !ARG_FORCE && !ARG_DRY) {
    log('[paused] autoPost is false in data/config.json — automatic posting paused (manual force still works)')
    const n = await cancelPendingScheduled(page, state)
    if (n > 0) { await writeState(state); log(`[paused] cancelled ${n} pending Meta-scheduled post(s)`) }
    return
  }

  const { photos, captions } = await loadLibrary()
  if (photos.length === 0 || captions.length === 0) {
    const why = photos.length === 0 ? 'no .jpg files in data/photos/' : 'no captions in data/captions.txt'
    recordEvent(state, { level: 'error', date: now.date, slot: '', message: `Nothing to post: ${why}` })
    await writeState(state)
    throw new Error(`Nothing to post: ${why}`)
  }
  log(`[library] ${photos.length} photo(s), ${captions.length} caption(s)`)

  // ---- reconcile: confirm Meta-scheduled slots that have gone live ----
  if (!ARG_DRY) {
    const changed = await reconcileScheduled(page, state, grace)
    if (changed) { await writeState(state); log('[reconcile] recorded live permalinks for scheduled slots') }
  }

  // ---- slot decision (mirrors src/lib/scheduler.ts) ----
  if (slots.length === 0) throw new Error('No valid slots in data/config.json ("slots" field)')
  let target = null
  let missed = []
  const doneToday = state.days[now.date] ?? {}

  if (ARG_FORCE || ARG_DRY) {
    // manual runs: first rescue the slot that is due RIGHT NOW — the most
    // recent past slot without BOTH halves done. A 'scheduled' slot (FB booked
    // on Meta) whose IG half is missing IS rescuable: force posts just the IG
    // half right now (FB is already in Meta's hands).
    for (const s of [...slots].reverse()) {
      if (s.minutes > now.minutesOfDay) continue
      const done = state.days[now.date]?.[s.label]
      if (done && ['published', 'guarded', 'cancelled'].includes(done.status)) continue
      if (done && done.ig?.id) continue // IG half already live/adopted
      // Force also rescues slots the auto path already closed (owner rule
      // 2026-09-24): 'partial' = FB live via Meta but the IG half never went
      // out (window lapsed) → force posts JUST the IG half with the slot's
      // pinned photo+caption; 'missed' = nothing was booked at all → both
      // halves fresh. This is what the rescue button always promised.
      const igOnly = Boolean(done && done.fb?.id && ['scheduled', 'partial'].includes(done.status))
      target = { ...s, date: now.date, igOnly }
      break
    }
    // otherwise the next future slot (today, else tomorrow)
    if (!target) {
      for (const dayOffset of [0, 1]) {
        const dk = dayOffset === 0 ? now.date : addDaysKey(now.date, 1)
        for (const s of slots) {
          if (dayOffset === 0 && s.minutes <= now.minutesOfDay) continue
          const done = state.days[dk]?.[s.label]
          if (done && ['published', 'partial', 'scheduled'].includes(done.status)) continue
          target = { ...s, date: dk }
          break
        }
        if (target) break
      }
    }
  } else {
    for (const s of slots) {
      const rec = doneToday[s.label]
      const since = now.minutesOfDay - s.minutes
      if (rec && rec.status === 'scheduled') {
        // FB is booked on Meta and will publish on time; the IG half is ours.
        // Post it the moment a landed run sees the slot time arrive.
        if (!rec.ig?.id && since >= 0 && since <= grace) target = { ...s, igOnly: true }
        continue
      }
      if (rec) continue
      if (since >= 0 && since <= grace) target = s
      else if (since > grace) missed.push(s)
    }
    // mark permanently-missed slots once (so they are not retried)
    for (const s of missed) {
      doneToday[s.label] = { status: 'missed', at: new Date().toISOString() }
      recordEvent(state, { level: 'info', date: now.date, slot: s.label, message: `Slot ${s.label} missed (outside ${grace}-min catch-up window)` })
    }
    if (missed.length > 0) state.days[now.date] = doneToday
  }

  if (!target && missed.length > 0) await writeState(state)

  // ---- horizon: upcoming slots to pre-schedule with Meta's own scheduler ----
  const horizon = scheduleDays >= 2 ? buildHorizon(state, slots, now, tz, scheduleDays) : []

  if (ARG_DRY) {
    let pi = state.rotation.photoIndex
    if (target) {
      const rec = state.days[target.date ?? now.date]?.[target.label]
      if (target.igOnly) {
        log(`[pick] slot ${target.label} on ${target.date ?? now.date} → IG half only (FB already booked on Meta, photo "${rec?.photo ?? '?'}")`)
        log('[dry-run] would publish Instagram only right now:')
        log(`  Instagram (${page.igUsername || page.igUserId}): hidden FB photo → CDN url → container → media_publish`)
      } else {
        const dPhoto = photos[pi % photos.length]
        log(`[pick] slot ${target.label} on ${target.date ?? now.date} → photo: ${dPhoto} (rotation index ${pi % photos.length} of ${photos.length})`)
        pi++
        log('[dry-run] would publish now:')
        log(`  Instagram (${page.igUsername || page.igUserId}): hidden FB photo → CDN url → container → media_publish`)
        log(`  Facebook (${page.pageName}): binary upload with caption`)
      }
    }
    if (horizon.length > 0) {
      log(`[dry-run] would pre-schedule ${horizon.length} slot(s) — FB via Meta exactly on time; IG posted later by landed catch-up runs:`)
      for (const h of horizon) {
        const ph = photos[pi % photos.length]
        pi++
        log(`  ${h.dk} ${h.slot.label} → "${ph}" → FB at ${new Date(h.slotUnix).toISOString()} + IG on the next landed run after that`)
      }
    }
    log('[dry-run] nothing published or scheduled, state unchanged')
    return
  }

  if (target) {
    const dateKey = target.date ?? now.date
    const slotLabel = `${target.label} Auto`
    const existing = state.days[dateKey]?.[target.label] // set when this slot was pre-booked on Meta

    // ---- pick content ----
    // IG-catch-up (slot was pre-booked on Meta): reuse the slot's OWN photo and
    // caption recorded at booking time — the FB half is already live/live-soon
    // with exactly this content; IG must match it, not advance the rotation.
    // Fresh catch-up: rotation picks, both platforms, as always.
    let photoFile, captionText
    if (target.igOnly && existing?.photo && existing?.caption) {
      photoFile = existing.photo
      captionText = existing.caption
      log(`[pick] slot ${slotLabel} on ${dateKey} → IG half of pre-booked slot (photo "${photoFile}" pinned at booking time)`)
    } else {
      photoFile = photos[state.rotation.photoIndex % photos.length]
      captionText = captions[state.rotation.captionIndex % captions.length]
      log(`[pick] slot ${slotLabel} on ${dateKey} → photo: ${photoFile} (rotation index ${state.rotation.photoIndex % photos.length} of ${photos.length})`)
    }
    const photoPath = path.join(PHOTOS_DIR, photoFile)
    log(`[pick] caption: "${captionText.slice(0, 70).replace(/\n/g, ' ')}…" (${captionText.length} chars)`)

    // ---- adopt an already-live IG twin BEFORE (re)publishing (robustness) ----
    // a previous catch-up attempt may have timed out AFTER the post actually
    // went out server-side (phantom) — a blind retry would double-post;
    // adopting closes the slot. (Full-caption match — TLP captions share a
    // fixed header, so a prefix match would match every post.)
    if (target.igOnly) {
      const sinceMs = existing?.publishTime ? new Date(existing.publishTime).getTime() - 2 * 3600000 : Date.now() - 26 * 3600000
      const adopt = await findMatchingIgPost(page, captionText, sinceMs)
      if (adopt) {
        const aday = state.days[dateKey] ?? {}
        aday[target.label] = {
          ...existing,
          status: 'published',
          at: existing?.publishTime ?? new Date().toISOString(),
          ig: { id: adopt.id, permalink: adopt.permalink, adopted: true },
        }
        state.days[dateKey] = aday
        recordEvent(state, { level: 'success', date: dateKey, slot: target.label, message: `${slotLabel}: IG half adopted from the live feed (caption match) — ${adopt.permalink || adopt.id}` })
        await writeState(state)
        log(`[adopt] this slot's caption is already live on IG (${adopt.permalink || adopt.id}) — adopted as the IG half, no new post`)
        target = null
      }
    }

    // ---- duplicate guard (cross-runtime safety net) ----
    // IG-only catch-ups check IG only — the FB twin publishes via Meta at slot
    // time and would false-positive the FB side of the guard.
    const guardMinutes = ARG_FORCE ? 3 : 30
    const lastAgo = target
      ? (target.igOnly ? await minutesSinceLastIgPost(page, state) : await minutesSinceLastPost(page, state))
      : null
    if (!target) {
      // the slot was closed via adoption above — nothing left to publish
    } else if (lastAgo !== null && lastAgo < guardMinutes) {
      log(`[guard] a post went out ${lastAgo} min ago (< ${guardMinutes} min guard) — skipping to avoid double-posting`)
      const gday = state.days[dateKey] ?? {}
      gday[target.label] = target.igOnly
        ? { ...existing, guard: new Date().toISOString() } // keep the booking; a later run retries the IG half
        : { status: 'guarded', at: new Date().toISOString() }
      state.days[dateKey] = gday
      recordEvent(state, { level: 'info', date: dateKey, slot: target.label, message: `Skipped by duplicate guard — last post ${lastAgo} min ago${target.igOnly ? ' (IG half; booking kept for retry)' : ''}` })
      await writeState(state)
      target = null
    } else {
      // ---- publish ----
      log(`[post] publishing slot ${slotLabel} ${target.igOnly ? '(Instagram half; Facebook is in Meta\u2019s hands)' : ''} …`)
      const igResult = page.igUserId
        ? await publishInstagram(page, photoPath, captionText)
        : { ok: true, postId: '', permalink: '', error: '', steps: ['IG not configured'] }
      igResult.steps?.forEach((s) => log(`  IG: ${s}`))
      const fbResult = target.igOnly
        ? { ok: true, postId: existing?.fb?.id ?? '', permalink: existing?.fb?.permalink ?? '', error: '', steps: ['FB: pre-booked on Meta'] }
        : await publishFacebook(page, photoPath, captionText)
      if (target.igOnly) log('  FB: pre-booked on Meta (publishes/published at slot time — no action)')

      const igOk = igResult.ok
      const fbOk = fbResult.ok
      const status = igOk && fbOk ? 'published' : igOk || fbOk ? 'partial' : 'failed'
      log(`[post] IG: ${igOk ? `✓ ${igResult.permalink || igResult.postId}` : `✗ ${igResult.error}`}`)
      if (!target.igOnly) log(`[post] FB: ${fbOk ? `✓ ${fbResult.permalink || fbResult.postId}` : `✗ ${fbResult.error}`}`)

      // ---- state update ----
      // Robustness (owner rule 2026-09-23): an IG failure while the FB half is
      // live (or in Meta's hands) must NOT close the slot. The record stays
      // 'scheduled' with the pinned photo/caption and no ig.id — every later
      // landed run retries the IG half until the grace window lapses
      // (reconcile then closes it as 'partial', or adopts an external post).
      // One transient API failure (network blip, container timeout) never
      // costs a slot.
      const day = state.days[dateKey] ?? {}
      if (!igOk && fbOk) {
        day[target.label] = {
          status: 'scheduled', // stays open: IG pending, FB fine
          at: existing?.at ?? new Date().toISOString(),
          publishTime: existing?.publishTime ?? new Date().toISOString(),
          photo: photoFile ?? (existing?.photo ?? null),
          caption: captionText,
          ig: { error: igResult.error, retries: (existing?.ig?.retries ?? 0) + 1 },
          fb: target.igOnly
            ? (existing?.fb ?? { error: 'booking lost' })
            : { id: fbResult.postId, permalink: fbResult.permalink },
        }
        state.days[dateKey] = day
        // the live FB post consumed this content (non-igOnly case) — advance
        // the rotation so the next slot does not reuse the same photo/caption
        if (photoFile && !target.igOnly) {
          state.rotation.photoIndex = (state.rotation.photoIndex + 1) % photos.length
          state.rotation.captionIndex = (state.rotation.captionIndex + 1) % captions.length
        }
        recordEvent(state, {
          level: 'error',
          date: dateKey,
          slot: target.label,
          message: `${slotLabel}: IG half failed (${igResult.error}) — slot stays OPEN, later landed runs retry the IG half until the ${grace}-min window closes`,
        })
        await writeState(state)
        log(`[state] saved — ${dateKey} ${target.label} = IG pending (retry ${existing?.ig?.retries ? existing.ig.retries + 1 : 1}; FB ${target.igOnly ? 'in Meta\u2019s hands' : 'live'})`)
      } else {
        day[target.label] = {
          status,
          at: new Date().toISOString(),
          publishTime: existing?.publishTime,
          photo: photoFile,
          caption: captionText,
          ig: igOk ? { id: igResult.postId, permalink: igResult.permalink } : { error: igResult.error },
          fb: target.igOnly
            ? (existing?.fb ?? { error: 'booking lost' })
            : fbOk ? { id: fbResult.postId, permalink: fbResult.permalink } : { error: fbResult.error },
        }
        state.days[dateKey] = day
        if (status !== 'failed') {
          // rotation advanced at booking time for pre-booked slots — not here
          if (!target.igOnly) {
            state.rotation.photoIndex = (state.rotation.photoIndex + 1) % photos.length
            state.rotation.captionIndex = (state.rotation.captionIndex + 1) % captions.length
          }
        }
        recordEvent(state, {
          level: status === 'published' ? 'success' : 'error',
          date: dateKey,
          slot: target.label,
          message: `${slotLabel}: ${status}${target.igOnly ? ' (IG catch-up of Meta-scheduled slot)' : ''} — "${photoFile}" | IG ${igOk ? '✓' : `✗ ${igResult.error}`} | FB ${target.igOnly ? '✓ Meta' : fbOk ? '✓' : `✗ ${fbResult.error}`}`,
        })
        await writeState(state)
        log(`[state] saved — ${dateKey} ${target.label} = ${status}`)

        if (status === 'failed') {
          throw new Error(`Slot ${slotLabel} ended as "failed" — IG: ${igResult.error || 'ok'} | FB: ${fbResult.error || 'ok'}`)
        }
        if (status === 'partial' && !target.igOnly) {
          throw new Error(`Slot ${slotLabel} ended as "partial" — IG: ${igResult.error || 'ok'} | FB: ${fbResult.error || 'ok'}`)
        }
      }
    }
  } else {
    log(`[done] no slot due right now — today: ${Object.keys(doneToday).map((k) => `${k}=${doneToday[k].status}`).join(', ') || 'nothing posted yet'}`)
  }

  // ---- pre-schedule the horizon: FB only, Meta publishes exactly on time ----
  // (IG cannot be pre-scheduled — API dead. Landed runs post the IG half of
  // each slot in its catch-up window; see the igOnly logic above.)
  if (horizon.length > 0) log(`[schedule] pre-scheduling ${horizon.length} upcoming slot(s) on Facebook via Meta …`)
  let scheduledCount = 0
  for (const h of horizon) {
    const hPhoto = photos[state.rotation.photoIndex % photos.length]
    const hCaption = captions[state.rotation.captionIndex % captions.length]
    const hPhotoPath = path.join(PHOTOS_DIR, hPhoto)
    const hISO = new Date(h.slotUnix).toISOString()
    log(`[schedule] ${h.dk} ${h.slot.label} → "${hPhoto}" → FB publishes at ${hISO}; IG half on the next landed run after that`)
    const fbS = await scheduleFacebookPost(page, hPhotoPath, hCaption, Math.floor(h.slotUnix / 1000))
    if (fbS.ok) {
      const day = state.days[h.dk] ?? {}
      day[h.slot.label] = {
        status: 'scheduled',
        publishTime: hISO,
        at: new Date().toISOString(),
        photo: hPhoto,
        caption: hCaption,
        fb: { id: fbS.postId },
      }
      state.days[h.dk] = day
      state.rotation.photoIndex = (state.rotation.photoIndex + 1) % photos.length
      state.rotation.captionIndex = (state.rotation.captionIndex + 1) % captions.length
      recordEvent(state, { level: 'info', date: h.dk, slot: h.slot.label, message: `${h.slot.label} FB half pre-scheduled via Meta (publishes ${hISO}) — "${hPhoto}"; IG half to be posted by a landed run in the catch-up window` })
      scheduledCount++
    } else {
      recordEvent(state, { level: 'error', date: h.dk, slot: h.slot.label, message: `${h.slot.label} FB scheduling FAILED — ${fbS.error} (next run retries)` })
      log(`  ✗ FB scheduling failed: ${fbS.error} — next run retries`)
    }
  }
  if (scheduledCount > 0) {
    await writeState(state)
    log(`[state] saved — ${scheduledCount} upcoming slot(s): FB pre-scheduled with Meta`)
  }
}

function addDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
//  MUTUAL RESCUE — the "post like Biblia Tafsiri Mbalimbali" backstop (owner
//  rule 2026-09-24). GitHub drops most scheduled fires; landed runs arrive in
//  bursts with multi-hour gaps, so a page waiting for "the next landed run"
//  to publish its IG half can starve for a whole day even with a 4-hour
//  window. Fix: whenever this agent lands a run, it ALSO checks the sibling
//  pages (config "siblings", full "owner/repo" names) through the GitHub API
//  and dispatches a sibling's workflow directly when that sibling has
//  unfinished business — an API workflow_dispatch is 100% reliable, unlike
//  cron schedules. The dispatched run receives input rescuedBy=<this repo>
//  and skips its own sibling check (one hop, no dispatch ping-pong). Needs
//  a dispatch token (fine-grained PAT, contents:read + actions:write on the
//  sibling repos) — stored in data/config.json "dispatchToken"; the
//  DISPATCH_TOKEN repo secret overrides it if ever set; silently disabled
//  when it or the "siblings" config is absent. Never dispatches on dry-runs and never
//  fails the run it lives in.
// ─────────────────────────────────────────────────────────────────────────────
function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'social-agent-mutual-rescue',
  }
}

async function fetchRepoText(full, filePath, token) {
  const parts = filePath.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`https://api.github.com/repos/${full}/contents/${parts}?ref=main`, { headers: ghHeaders(token) })
  if (!res.ok) return null
  const j = await res.json().catch(() => null)
  if (!j || j.encoding !== 'base64' || !j.content) return null
  return Buffer.from(j.content, 'base64').toString('utf8')
}

async function dispatchSiblingWorkflow(full, token, rescuedBy, force = false) {
  const inputs = { rescuedBy }
  if (force) inputs.force = 'true' // boolean-typed workflow input: API takes the string "true"
  const res = await fetch(`https://api.github.com/repos/${full}/actions/workflows/social-agent.yml/dispatches`, {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }),
  })
  if (res.ok) return { ok: true }
  const detail = await res.text().catch(() => '')
  return { ok: false, detail: `HTTP ${res.status} ${detail.slice(0, 140)}` }
}

async function mutualRescue() {
  if (ARG_DRY) return // never trigger dispatches from a dry run
  const rescuedBy = String(process.env.INPUT_RESCUED_BY ?? '').trim()
  if (rescuedBy) {
    log(`[rescue] this run was dispatched by "${rescuedBy}" — sibling check skipped (one hop)`)
    return
  }
  let cfg
  try { cfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8')) } catch { return }
  const token = String(process.env.DISPATCH_TOKEN || cfg.dispatchToken || '').trim()
  const self = String(process.env.GITHUB_REPOSITORY ?? 'local-run')
  const siblings = String(cfg.siblings ?? '')
    .split(',').map((x) => x.trim()).filter((x) => x && x.includes('/') && x !== self)
  if (!token || siblings.length === 0) return // not configured — silently off
  for (const full of siblings) {
    try {
      const [cfgTxt, stateTxt] = await Promise.all([
        fetchRepoText(full, 'data/config.json', token),
        fetchRepoText(full, 'data/state.json', token),
      ])
      if (!cfgTxt || !stateTxt) { log(`[rescue] ${full}: state/config unreadable — skipped`); continue }
      const cfgS = JSON.parse(cfgTxt)
      const stateS = JSON.parse(stateTxt)
      const tzS = cfgS.timezone || 'Africa/Dar_es_Salaam'
      const slotsS = parseSlots(String(cfgS.slots ?? ''))
      const graceS = Number(cfgS.graceMinutes ?? 60)
      const nowS = localNow(tzS)
      const days = stateS.days ?? {}
      let why = null
      let forceRescue = false
      // (a) a slot that is due RIGHT NOW (inside the sibling's own catch-up
      //     window) whose IG half is still missing — the dispatched run will
      //     publish it immediately
      for (const s of slotsS) {
        const since = nowS.minutesOfDay - s.minutes
        if (since < 0 || since > graceS) continue
        const rec = days[nowS.date]?.[s.label]
        if (!rec) { why = `today's ${s.label} slot never booked (catch-up due)`; break }
        if (rec.status === 'scheduled' && !rec.ig?.id) { why = `today's ${s.label} IG half still missing (${since} min after slot time)`; break }
      }
      // (b) FB horizon empty — no Meta-scheduled slot at all for the next 2
      //     days (the sibling's own runs have not landed for ~2 days)
      if (!why && slotsS.length > 0) {
        const booked = [addDaysKey(nowS.date, 1), addDaysKey(nowS.date, 2)]
          .some((dk) => Object.values(days[dk] ?? {}).some((r) => r && r.status === 'scheduled'))
        if (!booked) why = 'no Meta-scheduled slots for the next 2 days (FB horizon empty)'
      }
      // (c) TODAY's slot already closed 'partial' (FB live via Meta, IG half
      //     missing — the sibling's catch-up window lapsed before ANY run
      //     landed; exactly the 2026-09-29 TLP failure: earliest slot of the
      //     three pages + GitHub's 03:00-07:00 UTC dead zone) or 'missed'
      //     (nothing booked at all). Still within the RESCUE EXTENSION
      //     (slot + grace + 120 min, same calendar afternoon in the sibling's
      //     timezone): dispatch with force=true — the sibling's force path
      //     posts JUST the missing IG half right now (both halves for
      //     'missed'). Past the extension the day stays skipped (manual force
      //     button only) — IG still never posts at arbitrary times of day.
      if (!why) {
        for (const s of slotsS) {
          const rec = days[nowS.date]?.[s.label]
          if (!rec || rec.ig?.id || !['partial', 'missed'].includes(rec.status)) continue
          const since = nowS.minutesOfDay - s.minutes
          if (since < 0 || since > graceS + 120) continue
          why = `today's ${s.label} slot is ${rec.status} with the IG half missing (${Math.max(since - graceS, 0)} min past its window) — force rescue`
          forceRescue = true
          break
        }
      }
      if (why) {
        const res = await dispatchSiblingWorkflow(full, token, self, forceRescue)
        log(res.ok
          ? `[rescue] dispatched ${full}${forceRescue ? ' (FORCE)' : ''} — ${why}`
          : `[rescue] could NOT dispatch ${full} (${res.detail}) — ${why}`)
      } else {
        log(`[rescue] ${full} healthy — no dispatch needed`)
      }
    } catch (e) {
      log(`[rescue] ${full}: check failed (${e.message}) — skipped`)
    }
  }
}

main()
  .catch((e) => { console.error(`[agent] FAILED: ${e.message}`); process.exitCode = 1 })
  .finally(() => mutualRescue().catch((e) => console.error(`[rescue] FAILED: ${e.message}`)))
