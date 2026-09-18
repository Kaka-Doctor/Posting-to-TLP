const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function main() {
  const s = await db.settings.findUnique({ where: { id: 'settings' } })

  // Full permission list, one per line
  const res = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${s.metaUserToken}`)
  const json = await res.json()
  console.log('=== GRANTED PERMISSIONS ===')
  for (const p of json.data ?? []) console.log(` ${p.permission}: ${p.status}`)

  // Token metadata
  const debug = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${s.pageAccessToken}&access_token=${s.metaUserToken}`
  )
  const dj = await debug.json()
  if (dj.data) {
    console.log('\n=== PAGE TOKEN INFO ===')
    console.log(' valid:', dj.data.is_valid, '| scopes:', (dj.data.scopes ?? []).join(', '))
    console.log(' expires:', dj.data.expires_at ? new Date(dj.data.expires_at * 1000).toISOString() : 'never')
  }

  // Groq models endpoint (auth-level check)
  const g = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${s.groqApiKey}` },
  })
  console.log('\n=== GROQ /models ===', g.status, (await g.text()).slice(0, 200))
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
