import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettings, parseSlots, log } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getSettings()
  return NextResponse.json({
    autoPost: s.autoPost,
    timezone: s.timezone,
    slots: s.slots,
    graceMinutes: s.graceMinutes,
    aiEnabled: s.aiEnabled,
    aiEnhanceCaptions: s.aiEnhanceCaptions,
    groqModel: s.groqModel,
    pageTheme: s.pageTheme,
    publicBaseUrl: s.publicBaseUrl,
  })
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  if (typeof body.autoPost === 'boolean') data.autoPost = body.autoPost
  if (typeof body.timezone === 'string' && body.timezone.trim()) {
    // Validate the timezone string actually resolves
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: body.timezone })
      data.timezone = body.timezone.trim()
    } catch {
      return NextResponse.json({ error: 'Unknown timezone' }, { status: 400 })
    }
  }
  if (typeof body.slots === 'string') {
    const parsed = parseSlots(body.slots)
    if (parsed.length === 0 || parsed.length > 6) {
      return NextResponse.json({ error: 'Slots must be 1-6 times in HH:MM format' }, { status: 400 })
    }
    const hhmm = parsed.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    data.slots = hhmm.join(',')
  }
  if (typeof body.graceMinutes === 'number' && body.graceMinutes >= 0 && body.graceMinutes <= 480) {
    data.graceMinutes = Math.round(body.graceMinutes)
  }
  if (typeof body.aiEnabled === 'boolean') data.aiEnabled = body.aiEnabled
  if (typeof body.aiEnhanceCaptions === 'boolean') data.aiEnhanceCaptions = body.aiEnhanceCaptions
  if (typeof body.groqModel === 'string' && body.groqModel.trim()) data.groqModel = body.groqModel.trim()
  if (typeof body.pageTheme === 'string') data.pageTheme = body.pageTheme.slice(0, 300)
  if (typeof body.groqApiKey === 'string' && body.groqApiKey.trim()) data.groqApiKey = body.groqApiKey.trim()
  if (typeof body.publicBaseUrl === 'string') {
    data.publicBaseUrl = body.publicBaseUrl.trim().replace(/\/$/, '')
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  await getSettings() // ensure row exists
  const updated = await db.settings.update({ where: { id: 'settings' }, data })
  await log('info', 'Settings updated from dashboard')
  return NextResponse.json({
    autoPost: updated.autoPost,
    timezone: updated.timezone,
    slots: updated.slots,
    graceMinutes: updated.graceMinutes,
    aiEnabled: updated.aiEnabled,
    aiEnhanceCaptions: updated.aiEnhanceCaptions,
    groqModel: updated.groqModel,
    pageTheme: updated.pageTheme,
    publicBaseUrl: updated.publicBaseUrl,
  })
}
