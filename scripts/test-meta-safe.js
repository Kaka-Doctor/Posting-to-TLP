/**
 * SAFE end-to-end Meta publish validation (nothing visible ever hits the feeds):
 *
 *  1. Facebook: POST /photos with published=false  → creates an *unpublished*
 *     photo post (invisible on the Page feed) → read it back → DELETE it.
 *     Proves: page token works, photo publish permission, image fetch, cleanup.
 *
 *  2. Instagram: create a media *container* with a public image_url, poll
 *     until FINISHED, then never call media_publish. Unpublished containers
 *     are silently discarded by Meta after 24h — zero feed impact.
 *     Proves: IG permission, container flow, image processing by Meta.
 *
 * The production flow (src/lib/meta.ts) uses exactly these API calls, so if
 * this script passes, real posting will pass once publicBaseUrl is set
 * (Vercel does that automatically).
 *
 * Usage: node scripts/test-meta-safe.js
 */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const GRAPH = 'https://graph.facebook.com/v21.0'
const TEST_IMAGE = 'https://picsum.photos/id/237/1080/1080' // public JPEG

async function graph(path, params, method = 'GET') {
  const qs = new URLSearchParams(params).toString()
  const url = method === 'GET' ? `${GRAPH}/${path}?${qs}` : `${GRAPH}/${path}`
  const res = await fetch(url, {
    method,
    ...(method === 'GET' ? {} : { body: new URLSearchParams(params) }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, json }
}

async function testFacebook(s) {
  console.log('\n━━━ 1) FACEBOOK — unpublished photo post ━━━')
  const created = await graph(`${s.pageId}/photos`, {
    url: TEST_IMAGE,
    caption: 'Agent connectivity test (unpublished, will be deleted).',
    published: 'false',
    access_token: s.pageAccessToken,
  }, 'POST')
  console.log('create:', created.status, JSON.stringify(created.json).slice(0, 300))
  if (!created.ok) return 'FAILED'

  const postId = created.json.post_id ?? created.json.id
  // read back — proves the post exists and is unpublished
  const read = await graph(postId, { fields: 'id,is_published', access_token: s.pageAccessToken })
  console.log('read  :', read.status, JSON.stringify(read.json).slice(0, 200))

  const del = await graph(postId, { access_token: s.pageAccessToken }, 'DELETE')
  console.log('delete:', del.status, JSON.stringify(del.json).slice(0, 200))
  return del.ok ? 'PASSED (created unpublished post, read it, deleted it)' : 'FAILED to clean up'
}

async function testInstagram(s) {
  console.log('\n━━━ 2) INSTAGRAM — container only (no publish) ━━━')
  const container = await graph(`${s.igUserId}/media`, {
    image_url: TEST_IMAGE,
    caption: 'Container-only test — never published.',
    access_token: s.pageAccessToken,
  }, 'POST')
  console.log('container:', container.status, JSON.stringify(container.json).slice(0, 300))
  if (!container.ok) return 'FAILED'
  const creationId = container.json.id

  // poll exactly like src/lib/meta.ts does
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const status = await graph(creationId, { fields: 'status_code', access_token: s.pageAccessToken })
    const code = String(status.json.status_code ?? '')
    console.log(`  poll ${i + 1}: ${code}`)
    if (code === 'FINISHED') return 'PASSED (container processed — publish would succeed; container expires unused in 24h)'
    if (code === 'ERROR' || status.json.error) {
      console.log('  detail:', JSON.stringify(status.json).slice(0, 300))
      return 'FAILED (container error)'
    }
  }
  return 'FAILED (timeout — Meta never finished processing)'
}

async function main() {
  const s = await db.settings.findUnique({ where: { id: 'settings' } })
  console.log(`page: ${s.pageName} (${s.pageId})  |  IG: @${s.igUsername} (${s.igUserId})`)

  const fb = await testFacebook(s)
  const ig = await testInstagram(s)

  console.log('\n════════ RESULTS ════════')
  console.log('Facebook :', fb)
  console.log('Instagram:', ig)
  console.log('publicBaseUrl in DB:', JSON.stringify(s.publicBaseUrl), '(will auto-capture on Vercel)')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
