import { NextResponse } from 'next/server'
import { ensureSchema, importFromDataFolder } from '@/lib/importer'

export const dynamic = 'force-dynamic'

/**
 * Manually (re-)imports everything in the data/ folder:
 * config.json (tokens), photos/ (JPEGs), captions.txt.
 * Safe to press any time — existing entries are skipped.
 */
export async function POST() {
  try {
    await ensureSchema()
    const summary = await importFromDataFolder()
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : 'Import failed' },
      { status: 500 }
    )
  }
}
