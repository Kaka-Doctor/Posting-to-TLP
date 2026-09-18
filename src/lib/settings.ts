import { db } from '@/lib/db'
import type { Settings } from '@prisma/client'

export const GRAPH_API = 'https://graph.facebook.com/v21.0'

/**
 * Returns the singleton settings row, creating it on first access.
 * The Groq key is seeded from env on first creation (then editable in Setup).
 */
export async function getSettings(): Promise<Settings> {
  let settings = await db.settings.findUnique({ where: { id: 'settings' } })
  if (!settings) {
    settings = await db.settings.create({
      data: {
        id: 'settings',
        groqApiKey: process.env.GROQ_API_KEY ?? '',
        groqModel: process.env.GROQ_MODEL ?? 'groq/compound',
      },
    })
  }
  return settings
}

/** Which posting targets are currently configured */
export function targetsConfigured(s: Settings) {
  return {
    instagram: Boolean(s.igUserId && s.pageAccessToken),
    facebook: Boolean(s.pageId && s.pageAccessToken),
  }
}

/** Parse the slots string ("06:00,12:00,18:00") into minutes-of-day */
export function parseSlots(slots: string): number[] {
  return slots
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const m = raw.match(/^(\d{1,2}):(\d{2})$/)
      if (!m) return -1
      const h = parseInt(m[1], 10)
      const min = parseInt(m[2], 10)
      if (h < 0 || h > 23 || min < 0 || min > 59) return -1
      return h * 60 + min
    })
    .filter((v) => v >= 0)
    .sort((a, b) => a - b)
}

/** Current local wall-clock info in the configured timezone */
export function localNow(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hour = parseInt(get('hour'), 10) % 24
  const minute = parseInt(get('minute'), 10)
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

/** Minutes until the next slot fires (0 = firing now / within this minute) */
export function minutesUntilNextSlot(slots: string, timezone: string) {
  const list = parseSlots(slots)
  if (list.length === 0) return null
  const now = localNow(timezone)
  for (const slot of list) {
    if (slot >= now.minutesOfDay) return slot - now.minutesOfDay
  }
  return 1440 - now.minutesOfDay + list[0]
}

export async function log(level: 'info' | 'success' | 'error', message: string) {
  try {
    await db.agentLog.create({ data: { level, message: message.slice(0, 500) } })
  } catch (e) {
    console.error('[agent] failed to write log', e)
  }
}

/**
 * Hosts we never record as the public photo URL: local dev, the sandbox
 * gateway (session-affinity protected — Meta cannot crawl it), and preview
 * proxies. On a real deployment (Vercel etc.) the host is captured once.
 */
export function isUsablePublicHost(host: string): boolean {
  if (!host) return false
  if (host.includes('localhost') || host.startsWith('127.') || host.startsWith('0.0.0.0')) return false
  if (host.endsWith('.fcapp.run')) return false
  if (host.endsWith('.space-z.ai')) return false
  return true
}

/** Best-effort: remember the public URL photos are served from */
export async function capturePublicBaseUrl(request: Request): Promise<void> {
  try {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    const url = `${proto}://${host}`.replace(/\/$/, '')
    if (isUsablePublicHost(host)) {
      const s = await db.settings.findUnique({ where: { id: 'settings' } })
      const stale = !s?.publicBaseUrl || s.publicBaseUrl.includes('localhost') || s.publicBaseUrl.includes('fcapp.run')
      if (s && stale) {
        await db.settings.update({ where: { id: 'settings' }, data: { publicBaseUrl: url } })
      }
    }
  } catch {
    /* best effort */
  }
}
