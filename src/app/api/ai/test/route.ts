import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'
import { testGroq } from '@/lib/groq'

export const dynamic = 'force-dynamic'

export async function POST() {
  const settings = await getSettings()
  if (!settings.groqApiKey) {
    return NextResponse.json({ ok: false, message: 'No Groq API key set (add it in Setup)' }, { status: 400 })
  }
  const result = await testGroq(settings)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
