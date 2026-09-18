/**
 * Real end-to-end publish test against the user's Facebook Page using a
 * public test image. If the post succeeds, it is deleted immediately.
 * Reveals the exact Graph API response (incl. any permission gaps).
 */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const GRAPH = 'https://graph.facebook.com/v21.0'

async function main() {
  const s = await db.settings.findUnique({ where: { id: 'settings' } })
  console.log('page:', s.pageName, `(${s.pageId})`)

  // 1) Can Meta fetch a public image + does the token allow publishing?
  const body = new URLSearchParams({
    url: 'https://picsum.photos/id/237/1080/1080',
    caption: 'Agent connectivity test — deletes itself immediately.',
    access_token: s.pageAccessToken,
  })
  const res = await fetch(`${GRAPH}/${s.pageId}/photos`, { method: 'POST', body })
  const json = await res.json().catch(() => ({}))
  console.log('\n=== PUBLISH RESULT ===', res.status)
  console.log(JSON.stringify(json).slice(0, 600))

  // 2) Clean up if it worked
  const postId = json.post_id ?? json.id
  if (res.ok && postId) {
    const delBody = new URLSearchParams({ access_token: s.pageAccessToken })
    const del = await fetch(`${GRAPH}/${postId}`, { method: 'DELETE', body: delBody })
    const delJson = await del.json().catch(() => ({}))
    console.log('\n=== CLEANUP (delete test post) ===', del.status, JSON.stringify(delJson))
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
