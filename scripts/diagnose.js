/**
 * Diagnoses the two open questions:
 * 1. Groq: is the key valid? is the model name right?
 * 2. Meta: does the token have instagram permissions? is an IG account
 *    linked to the connected page?
 */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

async function groqTest(key, model) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 10,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) return `OK (${json.model ?? model}) → "${json.choices?.[0]?.message?.content?.trim().slice(0, 40)}"`
    return `HTTP ${res.status} — ${json.error?.message ?? JSON.stringify(json).slice(0, 200)}`
  } catch (e) {
    return `FETCH ERROR — ${e.message}`
  }
}

async function metaGet(path, token) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${path}${path.includes('?') ? '&' : '?'}access_token=${token}`)
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function main() {
  const s = await db.settings.findUnique({ where: { id: 'settings' } })

  console.log('================ GROQ ================')
  for (const model of ['groq/compound', 'compound', 'llama-3.3-70b-versatile']) {
    console.log(`model "${model}":`, await groqTest(s.groqApiKey, model))
  }

  console.log('\n================ META — user token ================')
  const perms = await metaGet('me/permissions', s.metaUserToken)
  console.log('permissions:', JSON.stringify(perms.json.data ?? perms.json).slice(0, 400))

  const accounts = await metaGet('me/accounts?fields=id,name,category,instagram_business_account{id,username}&limit=50', s.metaUserToken)
  if (accounts.json.data) {
    for (const p of accounts.json.data) {
      console.log(`page: ${p.name} (${p.id}) → IG: ${p.instagram_business_account ? `${p.instagram_business_account.username} (${p.instagram_business_account.id})` : 'NOT LINKED'}`)
    }
  } else {
    console.log('me/accounts:', JSON.stringify(accounts.json).slice(0, 300))
  }

  console.log('\n================ META — the page the user gave (61585710075643) ================')
  const given = await metaGet('61585710075643?fields=name,category,instagram_business_account{id,username}', s.metaUserToken)
  console.log(JSON.stringify(given.json).slice(0, 400))

  console.log('\n================ META — connected page token health ================')
  const health = await metaGet(`${s.pageId}?fields=name,instagram_business_account{id,username}`, s.pageAccessToken)
  console.log(JSON.stringify(health.json).slice(0, 400))
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
