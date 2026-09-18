import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettings, targetsConfigured, minutesUntilNextSlot, localNow } from '@/lib/settings'
import { schedulerInfo } from '@/lib/scheduler'
import { checkPageHealth } from '@/lib/meta'

export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getSettings()
  const targets = targetsConfigured(s)

  const [photoCount, activePhotoCount, captionCount, activeCaptionCount, postsToday, publishedTotal, recentLogs] =
    await Promise.all([
      db.photo.count(),
      db.photo.count({ where: { active: true } }),
      db.caption.count(),
      db.caption.count({ where: { active: true } }),
      db.post.count({ where: { source: 'auto', createdAt: { gte: startOfLocalDay(s.timezone) } } }),
      db.post.count({ where: { status: { in: ['published', 'partial'] } } }),
      db.agentLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
    ])

  let tokenHealth: { ok: boolean; message: string } = { ok: false, message: 'Not connected' }
  if (targets.facebook || targets.instagram) {
    tokenHealth = await checkPageHealth(s.pageId, s.pageAccessToken)
  }

  const minsLeft = minutesUntilNextSlot(s.slots, s.timezone)
  const now = localNow(s.timezone)

  const tokenDaysLeft =
    s.tokenExpiresAt && s.tokenExpiresAt.getTime() > Date.now()
      ? Math.ceil((s.tokenExpiresAt.getTime() - Date.now()) / 86400000)
      : null

  return NextResponse.json({
    autoPost: s.autoPost,
    timezone: s.timezone,
    slots: s.slots,
    graceMinutes: s.graceMinutes,
    aiEnabled: s.aiEnabled,
    aiEnhanceCaptions: s.aiEnhanceCaptions,
    groqModel: s.groqModel,
    groqKeySet: Boolean(s.groqApiKey),
    pageTheme: s.pageTheme,
    connected: {
      instagram: targets.instagram,
      facebook: targets.facebook,
      pageName: s.pageName,
      igUsername: s.igUsername,
      tokenHealth,
      tokenDaysLeft,
    },
    library: { photoCount, activePhotoCount, captionCount, activeCaptionCount },
    activity: {
      postsToday,
      publishedTotal,
      nextSlotInMinutes: minsLeft,
      localTime: `${now.hhmm} (${now.date})`,
    },
    scheduler: schedulerInfo(),
    recentLogs,
  })
}

function startOfLocalDay(timezone: string): Date {
  const d = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '01'
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`)
}
