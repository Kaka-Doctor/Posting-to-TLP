import { NextResponse } from 'next/server'
import { runTick } from '@/lib/scheduler'
import { ensureDb } from '@/lib/importer'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Cron entry point — used when hosting on Vercel (vercel.json crons) or by
 * any external cron service (cron-job.org etc.). Every hit runs one
 * scheduler pass: slots within the catch-up window fire, deduplicated.
 */
export async function GET(request: Request) {
  // Capture the public URL for image hosting (Vercel/sandbox) once
  try {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    const url = `${proto}://${host}`.replace(/\/$/, '')
    if (host && !host.includes('localhost')) {
      const settings = await db.settings.findUnique({ where: { id: 'settings' } })
      if (settings && (!settings.publicBaseUrl || settings.publicBaseUrl.includes('localhost') || settings.publicBaseUrl === '')) {
        await db.settings.update({ where: { id: 'settings' }, data: { publicBaseUrl: url } })
      }
    }
  } catch {
    /* best effort */
  }

  await ensureDb()
  const result = await runTick()
  return NextResponse.json({
    ok: true,
    ...result,
    lastTickAt: new Date().toISOString(),
  })
}
