const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  const posts = await db.post.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
  console.log('=== POSTS ===')
  for (const p of posts) {
    console.log(
      `[${p.slotKey}] ${p.slotLabel} | status=${p.status} | caption="${p.finalCaption.slice(0, 60)}"`,
      `\n   igErr=${p.igError || '-'} fbErr=${p.fbError || '-'} ai=${(p.aiReason || '').slice(0, 110)}`
    )
  }
  console.log('\n=== AGENT LOG (last 15) ===')
  const logs = await db.agentLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15 })
  for (const l of logs) console.log(`${l.createdAt.toISOString()} [${l.level}] ${l.message.slice(0, 160)}`)
  const s = await db.settings.findUnique({ where: { id: 'settings' } })
  console.log('\n=== CONNECTION ===')
  console.log('page:', s.pageName, '| pageId:', s.pageId)
  console.log('ig:', s.igUsername, '| igUserId:', s.igUserId)
  console.log('token expires:', s.tokenExpiresAt, '| publicBaseUrl:', JSON.stringify(s.publicBaseUrl))
  console.log('photoCount:', await db.photo.count(), '| captionCount:', await db.caption.count())
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
