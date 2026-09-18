import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { log } from '@/lib/settings'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { description?: string; active?: boolean }

  const data: Record<string, unknown> = {}
  if (typeof body.description === 'string') data.description = body.description.slice(0, 300)
  if (typeof body.active === 'boolean') data.active = body.active

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  try {
    const photo = await db.photo.update({ where: { id }, data })
    await log('info', `Photo "${photo.originalName}" updated`)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const photo = await db.photo.findUnique({ where: { id } })
  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  const dirs =
    photo.location === 'data'
      ? [path.join(process.cwd(), 'data', 'photos')]
      : [path.join(process.cwd(), 'uploads')]
  try {
    for (const dir of dirs) {
      await fs.unlink(path.join(dir, photo.filename)).catch(() => {})
      if (photo.thumbname) {
        await fs.unlink(path.join(dir, 'thumbs', photo.thumbname)).catch(() => {})
      }
    }
  } catch {
    /* disk cleanup is best-effort */
  }

  await db.photo.delete({ where: { id } })
  await log('info', `Photo "${photo.originalName}" removed from the library`)
  return NextResponse.json({ ok: true })
}
