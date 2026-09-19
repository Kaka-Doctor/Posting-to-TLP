export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureDb } = await import('./lib/importer')
    const { startScheduler } = await import('./lib/scheduler')
    try {
      await ensureDb()
    } catch (e) {
      console.error('[agent] boot bootstrap failed', e)
    }
    startScheduler()
  }
}
