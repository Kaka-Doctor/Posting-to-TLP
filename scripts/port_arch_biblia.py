#!/usr/bin/env python3
"""Port the FB-only-scheduling architecture from the main repo to the Biblia repo."""
import re

F = '/home/z/biblia-repo/scripts/gh-agent.mjs'
content = open(F).read()
applied = []


def rep(old, new, tag):
    global content
    assert old in content, f'NOT FOUND: {tag}'
    content = content.replace(old, new, 1)
    applied.append(tag)


# 1. remove scheduleInstagramPost + fix header comment
old_fn_start = content.index('async function scheduleInstagramPost')
old_fn_end = content.index('async function scheduleFacebookPost')
removed = content[old_fn_start:old_fn_end]
assert 'publish_time: publishTimeISO' in removed
content = content[:old_fn_start] + content[old_fn_end:]
applied.append('remove scheduleInstagramPost')

rep(
    '''// ── Meta-scheduled publishing (the reliability core) ────────────────────────
// IG: container with publish_time + media_publish → post sits in SCHEDULED
//     state on Meta's servers until the exact slot time.
// FB: photo upload with published=false + scheduled_publish_time.
// Meta publishes both punctually by itself — GitHub's schedule drops become
// irrelevant: any single landed run keeps the next `scheduleDays` days full.''',
    '''// ── Meta-scheduled publishing (the reliability core) ────────────────────────
// FB ONLY: photo upload with published=false + scheduled_publish_time — Meta
// publishes exactly at 09:00 EAT; GitHub's schedule drops become irrelevant
// for FB. IG has NO API scheduling (publish_time is SILENTLY IGNORED —
// media_publish posts immediately, verified live with a controlled experiment
// 2026-09-22; scheduled_publish_time is whitelist-gated). IG halves are posted
// directly by landed runs in each slot's catch-up window instead.''',
    'header comment')

# 2. new reconcileScheduled
old_recon_start = content.index('/** Confirm Meta-scheduled slots that have gone live → record permalinks. */')
old_recon_end = content.index('/** Pause switch: delete pending scheduled posts from Meta')
new_recon = '''/** Confirm Meta-scheduled FB posts that went live → record permalinks.
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
      } else if (Date.now() > due + graceMinutes * 60000) {
        rec.status = 'partial'
        rec.at = rec.publishTime
        recordEvent(state, { level: 'error', date: dk, slot: label, message: `${label} partial — FB published by Meta on time, but no landed run caught up the IG half within ${graceMinutes} min` })
        changed = true
      }
    }
  }
  return changed
}

'''
content = content[:old_recon_start] + new_recon + content[old_recon_end:]
applied.append('reconcileScheduled rewrite')

# 3. minutesSinceLastIgPost helper after minutesSinceLastPost
rep(
    '''  try {
    const json = await graphGet(`${page.pageId}/posts`, { fields: 'created_time', limit: '3', access_token: page.pageToken })
    const ts = (json.data ?? []).map((p) => (p.created_time ? new Date(p.created_time).getTime() : 0)).filter(Boolean).filter((t) => t < future)
    const latest = Math.max(...ts, 0)
    if (latest > cutoff) return Math.max(0, Math.round((Date.now() - latest) / 60000))
  } catch { /* unknown — do not block */ }
  return null
}
''',
    '''  try {
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
''', 'minutesSinceLastIgPost')

# 4. reconcile call site
rep(
    'const changed = await reconcileScheduled(page, state)',
    'const changed = await reconcileScheduled(page, state, grace)',
    'reconcile call')

# 5. slot decision — force/dry block
rep(
    '''  if (ARG_FORCE || ARG_DRY) {
    // manual runs: first rescue the slot that is due RIGHT NOW — the most
    // recent past slot with no successful post (includes slots already
    // marked "missed", excludes slots Meta already has scheduled).
    for (const s of [...slots].reverse()) {
      if (s.minutes > now.minutesOfDay) continue
      const done = state.days[now.date]?.[s.label]
      if (done && ['published', 'partial', 'scheduled'].includes(done.status)) continue
      target = { ...s, date: now.date }
      break
    }''',
    '''  if (ARG_FORCE || ARG_DRY) {
    // manual runs: first rescue the slot that is due RIGHT NOW — the most
    // recent past slot without BOTH halves done. A 'scheduled' slot (FB booked
    // on Meta) whose IG half is missing IS rescuable: force posts just the IG
    // half right now (FB is already in Meta's hands).
    for (const s of [...slots].reverse()) {
      if (s.minutes > now.minutesOfDay) continue
      const done = state.days[now.date]?.[s.label]
      if (done && ['published', 'partial', 'guarded', 'missed', 'cancelled'].includes(done.status)) continue
      if (done && done.status === 'scheduled' && done.ig?.id) continue // both halves done
      target = { ...s, date: now.date, igOnly: Boolean(done && done.status === 'scheduled' && !done.ig?.id) }
      break
    }''', 'force slot decision')

# 6. slot decision — auto block
rep(
    '''  } else {
    for (const s of slots) {
      if (doneToday[s.label]) continue
      const since = now.minutesOfDay - s.minutes
      if (since >= 0 && since <= grace) target = s
      else if (since > grace) missed.push(s)
    }''',
    '''  } else {
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
    }''', 'auto slot decision')

# 7. dry-run block
rep(
    '''  if (ARG_DRY) {
    let pi = state.rotation.photoIndex
    if (target) {
      const dPhoto = photos[pi % photos.length]
      log(`[pick] slot ${target.label} on ${target.date ?? now.date} → photo: ${dPhoto} (rotation index ${pi % photos.length} of ${photos.length})`)
      pi++
      log('[dry-run] would publish now:')
      log(`  Facebook (${page.pageName || 'Biblia Tafsiri Mbalimbali'}): binary upload with caption`)
      if (page.igUserId) log(`  Instagram (@${page.igUsername}): hidden FB photo → CDN url → container → media_publish`)
    }
    if (horizon.length > 0) {
      log(`[dry-run] would pre-schedule ${horizon.length} slot(s) via Meta (published exactly on time):`)
      for (const h of horizon) {
        const ph = photos[pi % photos.length]
        pi++
        log(`  ${h.dk} ${h.slot.label} → "${ph}" → Meta publishes at ${new Date(h.slotUnix).toISOString()}`)
      }
    }
    log('[dry-run] nothing published or scheduled, state unchanged')
    return
  }''',
    '''  if (ARG_DRY) {
    let pi = state.rotation.photoIndex
    if (target) {
      const rec = state.days[target.date ?? now.date]?.[target.label]
      if (target.igOnly) {
        log(`[pick] slot ${target.label} on ${target.date ?? now.date} → IG half only (FB already booked on Meta, photo "${rec?.photo ?? '?'}")`)
        if (page.igUserId) log('[dry-run] would publish Instagram only right now:')
        if (page.igUserId) log(`  Instagram (@${page.igUsername}): hidden FB photo → CDN url → container → media_publish`)
      } else {
        const dPhoto = photos[pi % photos.length]
        log(`[pick] slot ${target.label} on ${target.date ?? now.date} → photo: ${dPhoto} (rotation index ${pi % photos.length} of ${photos.length})`)
        pi++
        log('[dry-run] would publish now:')
        log(`  Facebook (${page.pageName || 'Biblia Tafsiri Mbalimbali'}): binary upload with caption`)
        if (page.igUserId) log(`  Instagram (@${page.igUsername}): hidden FB photo → CDN url → container → media_publish`)
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
  }''', 'dry-run block')

open(F, 'w').write(content)
print('applied:', applied)
