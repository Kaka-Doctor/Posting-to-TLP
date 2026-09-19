import { NextResponse } from 'next/server'
import { runTick } from '@/lib/scheduler'
import { ensureDb } from '@/lib/importer'
import { capturePublicBaseUrl } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/**
 * Cron entry point — used when hosting on Vercel (vercel.json crons) or by
 * any external cron service (cron-job.org etc.). Every hit runs one
 * scheduler pass: slots within the catch-up window fire, deduplicated.
 *
 * Optional protection: set CRON_SECRET (env) and call
 *   /api/cron?secret=YOUR_SECRET   or   Authorization: Bearer YOUR_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const url = new URL(request.url)
    const provided = url.searchParams.get('secret') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: 'Invalid or missing cron secret' }, { status: 401 })
    }
  }

  // Capture the public URL for image hosting (Vercel etc.) once
  await capturePublicBaseUrl(request)

  await ensureDb()
  const result = await runTick()
  return NextResponse.json({
    ok: true,
    ...result,
    lastTickAt: new Date().toISOString(),
  })
}
