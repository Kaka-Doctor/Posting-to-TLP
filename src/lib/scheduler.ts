import { db } from '@/lib/db'
import { getSettings, parseSlots, localNow, log } from '@/lib/settings'
import { runPostingJob } from '@/lib/poster'

const globalForScheduler = globalThis as unknown as {
  __schedulerStarted: boolean | undefined
  __lastTickAt: string | undefined
  __nextRunAt: string | undefined
}

const TICK_MS = 30 * 1000

/**
 * Self-healing scheduler: every 30 seconds it checks the local wall-clock
 * in the configured timezone against the posting slots. If a slot's time
 * has arrived (or passed within the catch-up window) and nothing was
 * posted for that slot yet, it fires the posting job. Restarts and missed
 * windows are handled gracefully instead of spamming.
 */
export function startScheduler() {
  if (globalForScheduler.__schedulerStarted) return
  globalForScheduler.__schedulerStarted = true

  const tick = async () => {
    globalForScheduler.__lastTickAt = new Date().toISOString()
    try {
      const settings = await getSettings()
      globalForScheduler.__nextRunAt = settings.autoPost ? 'armed' : 'paused'
      if (!settings.autoPost) return

      const slots = parseSlots(settings.slots)
      if (slots.length === 0) return

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
    } catch (e) {
      await log('error', `Scheduler tick error: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  tick()
  const interval = setInterval(tick, TICK_MS)
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
