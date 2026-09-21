import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { log } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const captions = await db.caption.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(
    captions.map((c) => ({
      id: c.id,
      text: c.text,
      active: c.active,
      timesUsed: c.timesUsed,
      lastUsedAt: c.lastUsedAt,
      createdAt: c.createdAt,
    }))
  )
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string; texts?: string[] }

  const texts: string[] = []
  if (typeof body.text === 'string') texts.push(body.text)
  if (Array.isArray(body.texts)) texts.push(...body.texts.filter((t) => typeof t === 'string'))

  const valid = texts.map((t) => t.trim()).filter((t) => t.length >= 2)
  if (valid.length === 0) {
    return NextResponse.json({ error: 'Caption text is required (min 2 characters)' }, { status: 400 })
  }
  if (valid.some((t) => t.length > 2200)) {
    return NextResponse.json({ error: 'Caption is over 2200 characters (Instagram limit)' }, { status: 400 })
  }

  await db.caption.createMany({ data: valid.map((text) => ({ text })) })
  await log('success', `Added ${valid.length} caption${valid.length > 1 ? 's' : ''} to the bank`)
  return NextResponse.json({ created: valid.length }, { status: 201 })
}
