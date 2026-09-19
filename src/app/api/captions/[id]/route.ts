import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { text?: string; active?: boolean }

  const data: Record<string, unknown> = {}
  if (typeof body.text === 'string') {
    const text = body.text.trim()
    if (text.length < 2 || text.length > 2200) {
      return NextResponse.json({ error: 'Caption must be 2-2200 characters' }, { status: 400 })
    }
    data.text = text
  }
  if (typeof body.active === 'boolean') data.active = body.active

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  try {
    await db.caption.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Caption not found' }, { status: 404 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await db.caption.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Caption not found' }, { status: 404 })
  }
}
