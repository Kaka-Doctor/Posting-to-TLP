#!/usr/bin/env node
/** Probe: is metaUserToken still alive? Can we mint a permanent page token for
 *  the "Biblia Tafsiri Mbalimbali" page (447560908444853)? Read-only + saves the
 *  minted token to a local staging file for the new repo. Prints NO token values. */
import { promises as fs } from 'node:fs'

const cfg = JSON.parse(await fs.readFile('/home/z/my-project/data/config.json', 'utf-8'))
const GRAPH = 'https://graph.facebook.com/v21.0'

async function g(p, params) {
  const url = new URL(`${GRAPH}/${p}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, json: j }
}

// 1. who is the user token?
const me = await g('me', { fields: 'id,name', access_token: cfg.metaUserToken })
console.log('[user-token] /me →', me.ok ? `ok: ${me.json.name} (${me.json.id})` : `FAIL ${me.status}: ${me.json?.error?.message}`)

// 2. mint the Biblia page token
const pageId = '447560908444853'
const page = await g(pageId, {
  fields: 'id,name,username,category,fan_count,access_token,instagram_business_account{id,username}',
  access_token: cfg.metaUserToken,
})
console.log('[biblia-page] lookup →', page.ok
  ? `ok: "${page.json.name}" id=${page.json.id} @${page.json.username} | category=${page.json.category} | fans=${page.json.fan_count} | IG=${page.json.instagram_business_account ? '@' + page.json.instagram_business_account.username : 'none'} | mintedTokenLen=${page.json.access_token?.length ?? 0}`
  : `FAIL ${page.status}: ${page.json?.error?.message}`)

// 3. verify the minted page token + inspect the page feed
if (page.ok && page.json.access_token) {
  const pt = page.json.access_token
  const v1 = await g(pageId, { fields: 'name,fan_count,link', access_token: pt })
  console.log('[biblia-page] token verify →', v1.ok ? `ok: "${v1.json.name}" (${v1.json.fan_count} fans) ${v1.json.link}` : `FAIL ${v1.status}: ${v1.json?.error?.message}`)
  const feed = await g(`${pageId}/posts`, { fields: 'id,message,created_time', limit: '5', access_token: pt })
  if (feed.ok) {
    console.log('[biblia-page] recent posts →')
    for (const p of feed.json.data ?? []) {
      console.log(`   ${p.created_time} | ${String(p.message ?? '').slice(0, 60).replace(/\n/g, ' ')}`)
    }
    if (!feed.json.data?.length) console.log('   (empty feed — no posts yet)')
  } else {
    console.log('[biblia-page] feed read → FAIL:', feed.json?.error?.message)
  }
  // staging file for the new repo build (never committed to the main repo)
  await fs.writeFile('/home/z/my-project/scripts/.biblia-page-token.json', JSON.stringify({
    pageId: page.json.id,
    name: page.json.name,
    username: page.json.username,
    token: pt,
    hasIG: Boolean(page.json.instagram_business_account),
  }, null, 2) + '\n')
  console.log('[biblia-page] minted permanent page token saved → scripts/.biblia-page-token.json (local staging only)')
}
