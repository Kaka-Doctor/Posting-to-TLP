import { promises as fs } from 'node:fs'
const GRAPH = 'https://graph.facebook.com/v23.0'
const PAGE_ID = '447560908444853'
const IG_ID = '17841470180666328'
const TOKEN = (await fs.readFile('/tmp/biblia_page_token.txt', 'utf-8')).trim()
const PHOTO = '/home/z/biblia-repo/data/photos/votd-2026-09-19.jpg'
async function gget(path, params) { const url = new URL(`${GRAPH}/${path}`); for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v)); const res = await fetch(url); return { ok: res.ok, json: await res.json().catch(() => ({})) } }
async function gpost(path, params) { const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) }); return { ok: res.ok, json: await res.json().catch(() => ({})) } }
const buf = await fs.readFile(PHOTO)
const form = new FormData()
form.append('published', 'false'); form.append('access_token', TOKEN)
form.append('source', new Blob([buf], { type: 'image/jpeg' }), 'test2.jpg')
let up = await fetch(`${GRAPH}/${PAGE_ID}/photos`, { method: 'POST', body: form })
let upJson = await up.json().catch(() => ({}))
console.log('helper photo:', JSON.stringify(upJson))
try {
  const info = (await gget(upJson.id, { fields: 'images', access_token: TOKEN })).json
  const cdn = (info.images ?? []).slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.source
  const schedUnix = Math.floor(Date.now() / 1000) + 25 * 60
  const cont = await gpost(`${IG_ID}/media`, { image_url: cdn, caption: 'TEST2 — scheduled_publish_time probe', scheduled_publish_time: schedUnix, access_token: TOKEN })
  console.log('container (scheduled_publish_time):', JSON.stringify(cont.json))
  if (cont.json.id) {
    await new Promise((r) => setTimeout(r, 5000))
    const pub = await gpost(`${IG_ID}/media_publish`, { creation_id: cont.json.id, access_token: TOKEN })
    console.log('media_publish:', JSON.stringify(pub.json))
    if (pub.json.id) {
      await new Promise((r) => setTimeout(r, 4000))
      const m = (await gget(pub.json.id, { fields: 'permalink,timestamp', access_token: TOKEN })).json
      console.log('media now:', JSON.stringify(m))
      const d = await fetch(`${GRAPH}/${pub.json.id}?access_token=${TOKEN}`, { method: 'DELETE' })
      console.log('cleanup delete:', d.status)
    }
  }
} finally {
  const d = await fetch(`${GRAPH}/${upJson.id}?access_token=${TOKEN}`, { method: 'DELETE' })
  console.log('helper cleanup:', d.status)
}
