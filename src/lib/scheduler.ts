import { db } from '@/lib/db'
import { getSettings, parseSlots, localNow, log } from '@/lib/settings'
import { ensureDb } from '@/lib/importer'
import { runPostingJob } from '@/lib/poster'

const globalForScheduler = globalThis as unknown as {
  __schedulerStarted: boolean | undefined
  __lastTickAt: string | undefined
  __nextRunAt: string | undefined
}

const TICK_MS = 30 * 1000

/**
 * One scheduler pass: checks the local wall-clock in the configured timezone
 * against the posting slots. If a slot's time has arrived (or passed within
 * the catch-up window) and nothing was posted for that slot yet, it fires
 * the posting job. Safe to call from a cron HTTP endpoint too (Vercel).
 */
export async function runTick(): Promise<{ fired: string[]; state: string }> {
  globalForScheduler.__lastTickAt = new Date().toISOString()
  const fired: string[] = []
  try {
    await ensureDb()
    const settings = await getSettings()
    globalForScheduler.__nextRunAt = settings.autoPost ? 'armed' : 'paused'

    if (settings.autoPost) {
      const slots = parseSlots(settings.slots)
      if (slots.length > 0) {
        const now = localNow(settings.timezone)
        const nowMin = now.minutesOfDay

        for (const slotMin of slots) {
          const hh = String(Math.floor(slotMin / 60)).padStart(2, '0')
          const mm = String(slotMin % 60).padStart(2, '0')
          const slotLabel = `${hh}:${mm} Auto`
          const slotKey = `${now.date}|${hh}:${mm}`

          const already = await db.post.findFirst({ where: { slotKey } })
          if (already) continue

          const minutesSince = nowMin - slotMin
          if (minutesSince >= 0 && minutesSince <= settings.graceMinutes) {
            await log('info', `Scheduler firing ${slotLabel} job`)
            await runPostingJob(slotKey, slotLabel, 'auto')
            fired.push(slotLabel)
          } else if (minutesSince > settings.graceMinutes) {
            // Slot passed while the agent was offline/paused — record it once
            await db.post.create({
              data: {
                slotKey,
                slotLabel,
                source: 'auto',
                status: 'skipped',
                igError: 'Missed window',
                fbError: 'Missed window',
                aiReason: `Server was offline or paused at ${hh}:${mm} (catch-up limit: ${settings.graceMinutes} min)`,
              },
            })
            await log('info', `Marked ${slotLabel} as missed (outside ${settings.graceMinutes}-min catch-up window)`)
          }
        }
      }
    }
    return { fired, state: globalForScheduler.__nextRunAt ?? 'starting' }
  } catch (e) {
    await log('error', `Scheduler tick error: ${e instanceof Error ? e.message : 'unknown'}`)
    return { fired, state: 'error' }
  }
}

/**
 * Starts the always-on interval scheduler (works wherever the process is
 * long-lived, e.g. the hosted sandbox / a Node server). Idempotent.
 */
export function startScheduler() {
  if (globalForScheduler.__schedulerStarted) return
  globalForScheduler.__schedulerStarted = true

  runTick()
  const interval = setInterval(runTick, TICK_MS)
  if (typeof interval.unref === 'function') interval.unref()
  console.log('[agent] scheduler started — checking slots every 30s')
}

export function schedulerInfo() {
  return {
    started: Boolean(globalForScheduler.__schedulerStarted),
    lastTickAt: globalForScheduler.__lastTickAt ?? null,
    state: globalForScheduler.__nextRunAt ?? 'starting',
  }
}
