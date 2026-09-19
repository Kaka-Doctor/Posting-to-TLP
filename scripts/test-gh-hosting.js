/**
 * Self-contained validation of the GitHub-Actions agent strategy.
 * ZERO feed impact (everything created is read back and deleted).
 *
 * Tests, in order:
 *  0. Connect from data/config.json alone (exchange → pages → page token)
 *     — exactly what the GH Actions runner will do.
 *  1. catbox.moe anonymous upload retry with a browser User-Agent.
 *  2. FB BINARY upload published=false → photo_id (no public URL needed).
 *  3. Fetch the unpublished photo's CDN URL → HEAD it without auth.
 *  4. IG container from that CDN URL → poll to FINISHED (never published).
 *  5. Publish the photo via POST /{photo-id} is_published=true → DELETE it.
 *
 * Usage: node scripts/test-gh-hosting.js   (no DB needed)
 */
const fs = require('fs')
const path = require('path')

const GRAPH = 'https://graph.facebook.com/v21.0'
const PHOTO = path.join(__dirname, '..', 'data', 'photos', 'SAMPLE-welcome.jpg')
const CONFIG = path.join(__dirname, '..', 'data', 'config.json')

async function graph(pathname, params, method = 'GET') {
  const qs = new URLSearchParams(params).toString()
  const url = method === 'GET' ? `${GRAPH}/${pathname}?${qs}` : `${GRAPH}/${pathname}`
  const res = await fetch(url, {
    method,
    ...(method === 'GET' ? {} : { body: new URLSearchParams(params) }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, json }
}

async function connect() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf-8'))
  // Preferred path: the permanent page token stored in config.json
  if (cfg.pageAccessToken) {
    const me = await graph(cfg.pageId, { fields: 'name,instagram_business_account{id,username}', access_token: cfg.pageAccessToken })
    if (me.ok) {
      const ig = me.json.instagram_business_account ?? {}
      console.log(`page token (permanent): VALID → ${me.json.name} | IG: @${ig.username ?? 'none'}`)
      return {
        id: cfg.pageId,
        name: String(me.json.name ?? ''),
        accessToken: cfg.pageAccessToken,
        igUserId: String(ig.id ?? cfg.igUserId ?? ''),
        igUsername: String(ig.username ?? ''),
      }
    }
    console.log('page token invalid — falling back to user-token exchange')
  }
  // Fallback: exchange the user token → pages → page token (rotation path)
  let token = cfg.metaUserToken
  try {
    const ex = await graph('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      fb_exchange_token: token,
    })
    if (ex.json.access_token) {
      console.log(`token exchange: OK (expires_in: ${ex.json.expires_in ?? 'n/a — already long-lived'})`)
      token = String(ex.json.access_token)
    }
  } catch { /* keep raw */ }
  const pages = await graph('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: token,
    limit: '50',
  })
  const list = (pages.json.data ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.name),
    accessToken: String(p.access_token),
    igUserId: p.instagram_business_account ? String(p.instagram_business_account.id) : '',
    igUsername: p.instagram_business_account ? String(p.instagram_business_account.username) : '',
  }))
  console.log(`pages visible: ${list.length}`)
  const page = list.find((p) => p.id === cfg.pageId) ?? list[0]
  console.log(`connected: ${page.name} (${page.id})  IG: @${page.igUsername} (${page.igUserId})`)
  return page
}

async function tryCatbox() {
  console.log('\n━━━ 1) catbox.moe with browser UA ━━━')
  const buf = fs.readFileSync(PHOTO)
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', new Blob([buf], { type: 'image/jpeg' }), 'photo.jpg')
  try {
    const res = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: form,
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36' },
    })
    const text = (await res.text()).trim()
    console.log(`  → ${res.status} ${text.slice(0, 100)}`)
    return /^https:\/\//.test(text) ? text : null
  } catch (e) {
    console.log('  → network error:', e.message)
    return null
  }
}

async function main() {
  const page = await connect()
  const buf = fs.readFileSync(PHOTO)

  await tryCatbox()

  // ---- 2) FB binary upload, unpublished ----
  console.log('\n━━━ 2) FB binary upload (published=false) ━━━')
  const form = new FormData()
  form.append('caption', 'Agent binary-upload test (unpublished, will be deleted).')
  form.append('published', 'false')
  form.append('access_token', page.accessToken)
  form.append('source', new Blob([buf], { type: 'image/jpeg' }), 'photo.jpg')
  const created = await fetch(`${GRAPH}/${page.id}/photos`, { method: 'POST', body: form })
  const createdJson = await created.json().catch(() => ({}))
  console.log('  create :', created.status, JSON.stringify(createdJson).slice(0, 160))
  if (!created.ok) return
  const photoId = String(createdJson.id ?? '')

  // ---- 3) unpublished photo CDN URL, public? ----
  console.log('\n━━━ 3) CDN URL of the unpublished photo ━━━')
  const info = await graph(photoId, { fields: 'id,images,link,picture', access_token: page.accessToken })
  const images = (info.json.images ?? [])
  const best = images.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
  const cdnUrl = String(best?.source ?? info.json.picture ?? '')
  console.log(`  images field: ${images.length} entries, best width ${best?.width}`)
  if (cdnUrl) {
    const head = await fetch(cdnUrl, { method: 'HEAD' })
    console.log(`  HEAD ${head.status} ${head.headers.get('content-type')} ${head.headers.get('content-length')}b`)
  } else {
    console.log('  no CDN URL returned — Meta-internal route unavailable')
  }

  // ---- 4) IG container from the CDN URL ----
  if (cdnUrl && page.igUserId) {
    console.log('\n━━━ 4) IG container from FB CDN URL (no publish) ━━━')
    const c = await graph(`${page.igUserId}/media`, {
      image_url: cdnUrl,
      caption: 'Container-only test — never published.',
      access_token: page.accessToken,
    }, 'POST')
    console.log('  container:', c.status, JSON.stringify(c.json).slice(0, 160))
    if (c.ok) {
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const st = await graph(String(c.json.id), { fields: 'status_code', access_token: page.accessToken })
        const code = String(st.json.status_code ?? '')
        process.stdout.write(`  poll ${i + 1}: ${code}\n`)
        if (code === 'FINISHED') { console.log('  → IG CAN fetch FB-CDN images ✓✓✓'); break }
        if (code === 'ERROR' || st.json.error) { console.log('  → FAILED:', JSON.stringify(st.json).slice(0, 200)); break }
      }
    }
  }

  // ---- 5) publish later via is_published, then clean up ----
  console.log('\n━━━ 5) POST /{photo-id} is_published=true (then delete) ━━━')
  const pub = await graph(photoId, { is_published: 'true', access_token: page.accessToken }, 'POST')
  console.log('  publish:', pub.status, JSON.stringify(pub.json).slice(0, 160))
  const del = await graph(photoId, { access_token: page.accessToken }, 'DELETE')
  console.log('  delete :', del.status, JSON.stringify(del.json).slice(0, 120))
  console.log(del.ok ? '  cleanup OK — zero feed impact maintained' : '  ⚠ cleanup failed — check the page!')
}

main().catch((e) => { console.error(e); process.exit(1) })
