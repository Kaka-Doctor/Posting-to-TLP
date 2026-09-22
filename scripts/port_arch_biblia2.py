#!/usr/bin/env python3
"""Port part 2: publish flow (igOnly) + FB-only horizon booking for Biblia."""

F = '/home/z/biblia-repo/scripts/gh-agent.mjs'
content = open(F).read()
applied = []


def rep(old, new, tag):
    global content
    assert old in content, f'NOT FOUND: {tag}'
    content = content.replace(old, new, 1)
    applied.append(tag)


# 8. publish flow
rep(
    '''  if (target) {
    const dateKey = target.date ?? now.date
    const slotLabel = `${target.label} Auto`

    // ---- pick content (rotation, mirrors poster's least-recently-used) ----
    const photoFile = photos[state.rotation.photoIndex % photos.length]
    const captionText = captions[state.rotation.captionIndex % captions.length]
    const photoPath = path.join(PHOTOS_DIR, photoFile)

    const plan = [
      `[pick] slot ${slotLabel} on ${dateKey}`,
      `[pick] photo: ${photoFile} (rotation index ${state.rotation.photoIndex % photos.length} of ${photos.length})`,
      `[pick] caption: "${captionText.slice(0, 70).replace(/\\n/g, ' ')}…" (${captionText.length} chars)`,
    ]
    plan.forEach(log)

    // ---- duplicate guard (cross-runtime safety net) ----
    const guardMinutes = ARG_FORCE ? 3 : 30
    const lastAgo = await minutesSinceLastPost(page, state)''',
    '''  if (target) {
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
    log(`[pick] caption: "${captionText.slice(0, 70).replace(/\\n/g, ' ')}…" (${captionText.length} chars)`)

    // ---- duplicate guard (cross-runtime safety net) ----
    // IG-only catch-ups check IG only — the FB twin publishes via Meta at slot
    // time and would false-positive the FB side of the guard.
    const guardMinutes = ARG_FORCE ? 3 : 30
    const lastAgo = target.igOnly
      ? await minutesSinceLastIgPost(page, state)
      : await minutesSinceLastPost(page, state)''',
    'publish flow head')

rep(
    '''      const gday = state.days[dateKey] ?? {}
      gday[target.label] = { status: 'guarded', at: new Date().toISOString() }
      state.days[dateKey] = gday''',
    '''      const gday = state.days[dateKey] ?? {}
      gday[target.label] = target.igOnly
        ? { ...existing, guard: new Date().toISOString() } // keep the booking; a later run retries the IG half
        : { status: 'guarded', at: new Date().toISOString() }
      state.days[dateKey] = gday''',
    'guard state keep booking')

rep(
    '''      // ---- publish ----
      log(`[post] publishing slot ${slotLabel} …`)
      const igResult = page.igUserId
        ? await publishInstagram(page, photoPath, captionText)
        : { ok: true, postId: '', permalink: '', error: '', steps: ['IG not configured'] }
      igResult.steps?.forEach((s) => log(`  IG: ${s}`))
      const fbResult = await publishFacebook(page, photoPath, captionText)''',
    '''      // ---- publish ----
      log(`[post] publishing slot ${slotLabel} ${target.igOnly ? '(Instagram half; Facebook is in Meta\\u2019s hands)' : ''} …`)
      const igResult = page.igUserId
        ? await publishInstagram(page, photoPath, captionText)
        : { ok: true, postId: '', permalink: '', error: '', steps: ['IG not configured'] }
      igResult.steps?.forEach((s) => log(`  IG: ${s}`))
      const fbResult = target.igOnly
        ? { ok: true, postId: existing?.fb?.id ?? '', permalink: existing?.fb?.permalink ?? '', error: '', steps: ['FB: pre-booked on Meta'] }
        : await publishFacebook(page, photoPath, captionText)
      if (target.igOnly) log('  FB: pre-booked on Meta (publishes/published at slot time — no action)')''',
    'publish body')

rep(
    '''      const igOk = igResult.ok
      const fbOk = fbResult.ok
      const status = igOk && fbOk ? 'published' : igOk || fbOk ? 'partial' : 'failed'
      log(`[post] IG: ${igOk ? `✓ ${igResult.permalink || igResult.postId}` : `✗ ${igResult.error}`}`)
      log(`[post] FB: ${fbOk ? `✓ ${fbResult.permalink || fbResult.postId}` : `✗ ${fbResult.error}`}`)

      // ---- state update ----
      const day = state.days[dateKey] ?? {}
      day[target.label] = {
        status,
        at: new Date().toISOString(),
        photo: photoFile,
        ig: igOk ? { id: igResult.postId, permalink: igResult.permalink } : { error: igResult.error },
        fb: fbOk ? { id: fbResult.postId, permalink: fbResult.permalink } : { error: fbResult.error },
      }
      state.days[dateKey] = day
      if (status !== 'failed') {
        state.rotation.photoIndex = (state.rotation.photoIndex + 1) % photos.length
        state.rotation.captionIndex = (state.rotation.captionIndex + 1) % captions.length
      }''',
    '''      const igOk = igResult.ok
      const fbOk = fbResult.ok
      const status = igOk && fbOk ? 'published' : igOk || fbOk ? 'partial' : 'failed'
      log(`[post] IG: ${igOk ? `✓ ${igResult.permalink || igResult.postId}` : `✗ ${igResult.error}`}`)
      if (!target.igOnly) log(`[post] FB: ${fbOk ? `✓ ${fbResult.permalink || fbResult.postId}` : `✗ ${fbResult.error}`}`)

      // ---- state update ----
      const day = state.days[dateKey] ?? {}
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
      }''',
    'state update')

# 9. horizon booking — FB only
old_h_start = content.index('  // ---- pre-schedule the horizon: Meta publishes these exactly on time ----')
old_h_end = content.index('function addDaysKey')
new_h = '''  // ---- pre-schedule the horizon: FB only, Meta publishes exactly on time ----
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

'''
content = content[:old_h_start] + new_h + content[old_h_end:]
applied.append('horizon FB-only')

open(F, 'w').write(content)
print('applied:', applied)
