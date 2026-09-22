#!/usr/bin/env node
/**
 * Controlled experiment: does IG container publish_time actually schedule?
 * Steps:
 *   1. helper photo (unpublished FB) → CDN url
 *   2. container with publish_time = now + 25 min
 *   3. media_publish → inspect response
 *   4. poll media: permalink / timestamp / status
 *   5. DELETE the test post at the end (cleanup)
 * Uses the Biblia page + IG (small audience, easy cleanup).
 */
import { promises as fs } from 'node:fs'

const GRAPH = 'https://graph.facebook.com/v23.0'
const PAGE_ID = '447560908444853'
const IG_ID = '17841470180666328'
const TOKEN = (await fs.readFile('/tmp/biblia_page_token.txt', 'utf-8')).trim()
const PHOTO = '/home/z/biblia-repo/data/photos/votd-2026-09-18.jpg'

async function gget(path, params) {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url)
  return { ok: res.ok, json: await res.json().catch(() => ({})) }
}
async function gpost(path, params) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return { ok: res.ok, json: await res.json().catch(() => ({})) }
}

// 1. helper photo
const buf = await fs.readFile(PHOTO)
const form = new FormData()
form.append('published', 'false')
form.append('access_token', TOKEN)
form.append('source', new Blob([buf], { type: 'image/jpeg' }), 'test.jpg')
let up = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: 'POST', body: form })
let upJson = await up.json().catch(() => ({}))
console.log('1. helper photo:', JSON.stringify(upJson))
const helperId = upJson.id

try {
  const info = (await gget(helperId, { fields: 'images', access_token: TOKEN })).json
  const cdn = (info.images ?? []).slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.source
  console.log('2. CDN url:', cdn?.slice(0, 80), '...')

  // 3. container with publish_time 25 min ahead (ISO 8601, no milliseconds)
  const pt = new Date(Date.now() + 25 * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  console.log('3. publish_time =', pt)
  const cont = await gpost(`${IG_ID}/media`, {
    image_url: cdn,
    caption: 'TEST — scheduling probe (will be deleted)',
    publish_time: pt,
    access_token: TOKEN,
  })
  console.log('   container response:', JSON.stringify(cont.json))
  const cid = cont.json.id

  // wait for FINISHED
  let ready = false
  for (let i = 0; i < 10; i++) {
    const st = (await gget(cid, { fields: 'status_code', access_token: TOKEN })).json
    if (String(st.status_code) === 'FINISHED') { ready = true; break }
    if (String(st.status_code) === 'ERROR') { console.log('   container ERROR'); break }
    await new Promise((r) => setTimeout(r, 2000))
  }
  console.log('4. container FINISHED:', ready)

  // 4. media_publish
  const pub = await gpost(`${IG_ID}/media_publish`, { creation_id: cid, access_token: TOKEN })
  console.log('5. media_publish response:', JSON.stringify(pub.json))
  const mid = pub.json.id

  // 5. poll the media
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    const m = (await gget(mid, { fields: 'permalink,timestamp,media_type', access_token: TOKEN })).json
    console.log(`6.${i} media ${mid}:`, JSON.stringify(m))
  }

  // check the container for scheduling fields
  const contInfo = (await gget(cid, { fields: 'status_code,publish_time', access_token: TOKEN })).json
  console.log('7. container fields:', JSON.stringify(contInfo))

  // cleanup: delete the test media + note its id
  console.log('8. test media id to delete:', mid)
  const del = await fetch(`${GRAPH}/${mid}?access_token=${TOKEN}`, { method: 'DELETE' })
  console.log('   delete result:', del.status, JSON.stringify(await del.json().catch(() => ({}))))
} finally {
  // delete helper photo
  if (helperId) {
    const d = await fetch(`${GRAPH}/${helperId}?access_token=${TOKEN}`, { method: 'DELETE' })
    console.log('cleanup: helper photo deleted:', d.status)
  }
}
