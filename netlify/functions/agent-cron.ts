import { schedule } from '@netlify/functions'

/**
 * The agent's clock on Netlify — runs every 10 minutes and pings the app's
 * /api/cron endpoint (one scheduler pass: fires any posting slot that is due,
 * deduplicated per slot). The same endpoint is used by Vercel's crons and by
 * any external cron service, so behavior is identical across hosts.
 *
 * Netlify injects `URL` (the site address) automatically.
 */
const handler = schedule('*/10 * * * *', async () => {
  const base = process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? ''
  if (!base) {
    console.error('[agent-cron] no site URL env var — cannot ping /api/cron')
    return { statusCode: 500, body: 'no site URL' }
  }
  try {
    const res = await fetch(`${base}/api/cron`, {
      headers: { 'user-agent': 'netlify-scheduled-function' },
    })
    const body = await res.text()
    console.log(`[agent-cron] /api/cron → ${res.status}: ${body.slice(0, 200)}`)
    return { statusCode: res.status, body: body.slice(0, 500) }
  } catch (e) {
    console.error('[agent-cron] ping failed', e)
    return { statusCode: 502, body: 'ping failed' }
  }
})

export default handler
